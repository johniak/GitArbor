/**
 * Local LLM provider backed by `node-llama-cpp`. Owns:
 *  - GGUF model download (HTTP stream → atomic rename), magic-byte check
 *  - Model lifecycle (load on demand, mutex against concurrent loads,
 *    hold-based ref counting, idle eviction, explicit pin via settings)
 *  - Hardware probe (GPU type / VRAM / RAM)
 *  - Streaming inference via `LlamaChatSession`
 *
 * Originally lived inline in `src/main/ai-service.ts`; extracted into a
 * provider so other AI sources (coding-agent, openai-compat) can plug
 * into the same orchestrator.
 */

import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { IPC } from '../../shared/ipc';
import {
  CURATED_MODELS,
  type AIDownloadOpts,
  type AIInferRequest,
  type AIStateEvent,
  type CuratedModel,
  type DownloadedModelMeta,
  type GpuKind,
  type HardwareInfo,
  type ModelEntry,
  type ModelStatus,
  type SourceReadyInfo,
} from '../../shared/ai-types';
import type { AppSettings } from '../../shared/app-settings-types';
import { loadAppSettings, updateAppSettings } from '../app-settings';
import type { AIProvider } from './index';

type LlamaModule = typeof import('node-llama-cpp');
type LlamaInstance = Awaited<ReturnType<LlamaModule['getLlama']>>;
type LoadedModel = Awaited<ReturnType<LlamaInstance['loadModel']>>;
type LoadedContext = Awaited<ReturnType<LoadedModel['createContext']>>;

const MODELS_DIR_NAME = 'models';
const TMP_DIR_NAME = '.tmp';
const GGUF_MAGIC = 0x46554747; // 'GGUF' little-endian
const PROGRESS_THROTTLE_MS = 100;
const IDLE_EVICTION_MS = 5 * 60 * 1000;

let userDataDir: string | null = null;
let llamaModule: LlamaModule | null = null;
let llama: LlamaInstance | null = null;
let cachedHardware: HardwareInfo | null = null;
let loaded: {
  id: string;
  model: LoadedModel;
  context: LoadedContext;
} | null = null;
let idleTimer: NodeJS.Timeout | null = null;
/** Serialise model loads so a holdModel() warmup and a concurrent
 *  inferStream() don't race two parallel loadModel() calls of the same
 *  ~1 GB GGUF. The chain only holds the resolved value of the *previous*
 *  load attempt — each call enqueues its own work. */
let loadMutex: Promise<unknown> = Promise.resolve();

const downloadAborts = new Map<string, AbortController>();
/** Active "holders" of the loaded model. While the set is non-empty the
 *  idle-eviction timer is suspended. */
const modelHolders = new Set<string>();

function isFakeMode(): boolean {
  return process.env.AI_E2E_FAKE === '1';
}

function modelsDir(): string {
  if (!userDataDir) throw new Error('local-llm: not initialized');
  return path.join(userDataDir, MODELS_DIR_NAME);
}

function tmpDir(): string {
  return path.join(modelsDir(), TMP_DIR_NAME);
}

function modelFilePath(id: string): string {
  // sanitize: only [a-zA-Z0-9._-]; replace ':' with '_' so IDs like
  // `custom:abc123` are safe on Windows.
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(modelsDir(), `${safe}.gguf`);
}

export function buildCustomId(url: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(url)
    .digest('hex')
    .slice(0, 12);
  return `custom_${hash}`;
}

function mapGpuType(raw: unknown): GpuKind {
  if (raw === 'metal') return 'metal';
  if (raw === 'cuda') return 'cuda';
  if (raw === 'vulkan') return 'vulkan';
  return 'cpu';
}

function broadcast(event: AIStateEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(IPC.AI_STATE_CHANGED, event);
  }
}

async function ensureDirs(): Promise<void> {
  await fs.promises.mkdir(modelsDir(), { recursive: true });
  await fs.promises.mkdir(tmpDir(), { recursive: true });
}

async function ensureLlama(): Promise<LlamaInstance> {
  if (llama) return llama;
  if (!llamaModule) {
    llamaModule = (await import('node-llama-cpp')) as LlamaModule;
  }
  llama = await llamaModule.getLlama({ gpu: 'auto' });
  return llama;
}

function curatedById(id: string): CuratedModel | undefined {
  return CURATED_MODELS.find((m) => m.id === id);
}

function scheduleIdleEviction(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  // No eviction if user wants the model pinned in memory, or while a
  // commit/branch view is currently holding it. In the holder case we
  // evict explicitly on the last release().
  const settings = loadAppSettings();
  if (settings.ai.keepModelLoaded) return;
  if (modelHolders.size > 0) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    void evictLoaded();
  }, IDLE_EVICTION_MS);
}

async function evictLoaded(): Promise<void> {
  if (!loaded) return;
  const id = loaded.id;
  try {
    await loaded.context.dispose();
  } catch {
    // ignore
  }
  try {
    await loaded.model.dispose();
  } catch {
    // ignore
  }
  loaded = null;
  broadcast({ type: 'model-unloaded', id });
}

async function loadIfNeeded(id: string): Promise<{
  model: LoadedModel;
  context: LoadedContext;
}> {
  const next = loadMutex.then(async () => {
    if (loaded && loaded.id === id) {
      return { model: loaded.model, context: loaded.context };
    }
    if (loaded) await evictLoaded();
    const filePath = modelFilePath(id);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Model file missing: ${filePath}`);
    }
    const llamaInst = await ensureLlama();
    const model = await llamaInst.loadModel({ modelPath: filePath });
    const context = await model.createContext();
    loaded = { id, model, context };
    broadcast({ type: 'model-ready', id });
    return { model, context };
  });
  // Don't break the chain on rejection; subsequent callers should still
  // be able to retry rather than inheriting the prior failure.
  loadMutex = next.catch(() => undefined);
  return next;
}

export async function init(dir: string): Promise<void> {
  userDataDir = dir;
  await ensureDirs();
  // Drop downloadedModels entries whose file vanished (e.g. user deleted
  // the userData/models folder by hand).
  const settings = loadAppSettings();
  const stale: string[] = [];
  for (const id of Object.keys(settings.ai.downloadedModels)) {
    if (!fs.existsSync(modelFilePath(id))) stale.push(id);
  }
  if (stale.length > 0) {
    const next = { ...settings.ai.downloadedModels };
    for (const id of stale) delete next[id];
    updateAppSettings({ ai: { downloadedModels: next } });
  }

  // Background warmup at app start, but ONLY if the user opted into
  // pinning the model in memory AND local-llm is the active source.
  if (
    settings.ai.enabled &&
    settings.ai.source === 'local-llm' &&
    settings.ai.keepModelLoaded &&
    !isFakeMode()
  ) {
    const id = settings.ai.selectedModelId;
    if (id && fs.existsSync(modelFilePath(id))) {
      void loadIfNeeded(id).catch((err) => {
        console.error('[local-llm] startup warmup failed:', err);
      });
    }
  }
}

export async function getHardwareInfo(): Promise<HardwareInfo> {
  if (cachedHardware) return cachedHardware;
  if (isFakeMode()) {
    cachedHardware = {
      gpu: 'cpu',
      ramMB: Math.round(os.totalmem() / 1024 / 1024),
    };
    return cachedHardware;
  }
  try {
    const llamaInst = await ensureLlama();
    const gpu = mapGpuType(llamaInst.gpu);
    let gpuName: string | undefined;
    let vramMB: number | undefined;
    try {
      const names = await llamaInst.getGpuDeviceNames();
      if (Array.isArray(names) && names.length > 0) gpuName = names[0];
    } catch {
      // ignore — some platforms don't expose names
    }
    try {
      const vram = await llamaInst.getVramState();
      if (vram?.total) vramMB = Math.round(vram.total / 1024 / 1024);
    } catch {
      // ignore
    }
    cachedHardware = {
      gpu,
      gpuName,
      vramMB,
      ramMB: Math.round(os.totalmem() / 1024 / 1024),
    };
  } catch (err) {
    cachedHardware = {
      gpu: 'cpu',
      ramMB: Math.round(os.totalmem() / 1024 / 1024),
      gpuName: err instanceof Error ? err.message : undefined,
    };
  }
  return cachedHardware;
}

function entryStatus(id: string): ModelStatus {
  if (downloadAborts.has(id)) return 'downloading';
  const settings = loadAppSettings();
  const meta = settings.ai.downloadedModels[id];
  if (!meta) return 'not-downloaded';
  if (!fs.existsSync(modelFilePath(id))) return 'not-downloaded';
  return 'ready';
}

export async function listModels(): Promise<ModelEntry[]> {
  const settings = loadAppSettings();
  const result: ModelEntry[] = [];
  for (const m of CURATED_MODELS) {
    result.push({
      id: m.id,
      name: m.name,
      family: m.family,
      sizeBytes: m.sizeBytes,
      contextWindow: m.contextWindow,
      url: m.url,
      status: entryStatus(m.id),
      isCustom: false,
    });
  }
  for (const [id, meta] of Object.entries(settings.ai.downloadedModels)) {
    if (curatedById(id)) continue;
    result.push({
      id,
      name: meta.label,
      family: 'custom',
      sizeBytes: meta.sizeBytes,
      contextWindow: meta.contextWindow,
      url: meta.sourceUrl,
      status: entryStatus(id),
      isCustom: true,
    });
  }
  return result;
}

export async function downloadModel(
  opts: AIDownloadOpts,
): Promise<{ id: string; error?: string }> {
  if (isFakeMode()) {
    const id =
      opts.id === 'custom' ? buildCustomId(opts.url ?? 'fake') : opts.id;
    broadcast({ type: 'download-complete', id });
    const stored: DownloadedModelMeta = {
      id,
      filename: `${id}.gguf`,
      sizeBytes: 0,
      sourceUrl: opts.url ?? 'fake://e2e',
      downloadedAt: Date.now(),
      isCustom: opts.id === 'custom',
      label: opts.label ?? curatedById(id)?.name ?? id,
      contextWindow: 4096,
    };
    const settings = loadAppSettings();
    updateAppSettings({
      ai: {
        downloadedModels: { ...settings.ai.downloadedModels, [id]: stored },
      },
    });
    return { id };
  }

  let canonicalId = opts.id;
  let url: string;
  let label: string;
  let contextWindow: number;
  let isCustom = false;

  const curated = curatedById(opts.id);
  if (curated) {
    url = curated.url;
    label = curated.name;
    contextWindow = curated.contextWindow;
  } else if (opts.id === 'custom') {
    if (!opts.url || !/^https?:\/\//.test(opts.url)) {
      return {
        id: opts.id,
        error: 'Custom URL must be http(s) and non-empty.',
      };
    }
    canonicalId = buildCustomId(opts.url);
    url = opts.url;
    label = opts.label?.trim() || canonicalId;
    contextWindow = 4096;
    isCustom = true;
  } else {
    return { id: opts.id, error: `Unknown model id: ${opts.id}` };
  }

  if (downloadAborts.has(canonicalId)) {
    return { id: canonicalId, error: 'Download already in progress.' };
  }

  const finalPath = modelFilePath(canonicalId);
  if (fs.existsSync(finalPath)) {
    // Already downloaded — treat as a no-op success.
    broadcast({ type: 'download-complete', id: canonicalId });
    return { id: canonicalId };
  }

  await ensureDirs();
  const partPath = path.join(tmpDir(), `${canonicalId}.gguf.part`);
  const ac = new AbortController();
  downloadAborts.set(canonicalId, ac);

  const startedAt = Date.now();
  let receivedBytes = 0;
  let totalBytes: number;
  let lastEmit = 0;
  const hash = crypto.createHash('sha256');

  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const len = res.headers.get('content-length');
    totalBytes = len ? Number.parseInt(len, 10) : 0;

    const fileHandle = await fs.promises.open(partPath, 'w');
    const reader = res.body.getReader();
    let firstChunkValidated = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          if (!firstChunkValidated && value.byteLength >= 4) {
            const view = new DataView(
              value.buffer,
              value.byteOffset,
              value.byteLength,
            );
            const magic = view.getUint32(0, true);
            if (magic !== GGUF_MAGIC) {
              throw new Error(
                'Downloaded file does not look like a GGUF model (invalid magic bytes).',
              );
            }
            firstChunkValidated = true;
          }
          await fileHandle.write(value);
          hash.update(value);
          receivedBytes += value.byteLength;
          const now = Date.now();
          if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
            const elapsed = (now - startedAt) / 1000;
            const bytesPerSec = elapsed > 0 ? receivedBytes / elapsed : 0;
            broadcast({
              type: 'download-progress',
              id: canonicalId,
              receivedBytes,
              totalBytes,
              bytesPerSec,
            });
            lastEmit = now;
          }
        }
      }
    } finally {
      await fileHandle.close();
    }

    if (!firstChunkValidated) {
      throw new Error('Downloaded file too small / not a GGUF model.');
    }

    await fs.promises.rename(partPath, finalPath);

    const sha = hash.digest('hex');
    const stored: DownloadedModelMeta = {
      id: canonicalId,
      filename: path.basename(finalPath),
      sizeBytes: receivedBytes,
      sourceUrl: url,
      downloadedAt: Date.now(),
      isCustom,
      label,
      contextWindow,
      sha256: sha,
    };
    const settings = loadAppSettings();
    updateAppSettings({
      ai: {
        downloadedModels: {
          ...settings.ai.downloadedModels,
          [canonicalId]: stored,
        },
      },
    });

    broadcast({ type: 'download-complete', id: canonicalId });
    return { id: canonicalId };
  } catch (err) {
    try {
      await fs.promises.unlink(partPath);
    } catch {
      // ignore
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (ac.signal.aborted) {
      broadcast({
        type: 'download-error',
        id: canonicalId,
        error: 'Cancelled',
      });
      return { id: canonicalId, error: 'Cancelled' };
    }
    broadcast({ type: 'download-error', id: canonicalId, error: msg });
    return { id: canonicalId, error: msg };
  } finally {
    downloadAborts.delete(canonicalId);
  }
}

export async function cancelDownload(id: string): Promise<void> {
  const ac = downloadAborts.get(id);
  if (!ac) return;
  ac.abort();
}

export async function removeModel(id: string): Promise<void> {
  if (loaded?.id === id) await evictLoaded();
  const filePath = modelFilePath(id);
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore — file may be missing already
  }
  const settings = loadAppSettings();
  if (settings.ai.downloadedModels[id]) {
    const next = { ...settings.ai.downloadedModels };
    delete next[id];
    updateAppSettings({ ai: { downloadedModels: next } });
  }
}

export async function shutdown(): Promise<void> {
  for (const ac of downloadAborts.values()) ac.abort();
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  await evictLoaded();
}

// ── AIProvider impl ────────────────────────────────────────────────

async function isReady(settings: AppSettings): Promise<SourceReadyInfo> {
  const id = settings.ai.selectedModelId;
  if (!id) {
    return { ready: false, source: 'local-llm', reason: 'No model selected' };
  }
  if (isFakeMode()) {
    return { ready: true, source: 'local-llm' };
  }
  if (!fs.existsSync(modelFilePath(id))) {
    return {
      ready: false,
      source: 'local-llm',
      reason: 'Model not downloaded',
    };
  }
  return { ready: true, source: 'local-llm' };
}

async function warmup(
  settings: AppSettings,
): Promise<{ holderId: string; error?: string }> {
  if (!settings.ai.enabled) return { holderId: '', error: 'AI disabled' };
  const id = settings.ai.selectedModelId;
  if (!id || !fs.existsSync(modelFilePath(id))) {
    return { holderId: '', error: 'Model not downloaded' };
  }
  const holderId = crypto.randomUUID();
  modelHolders.add(holderId);
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (isFakeMode()) return { holderId };
  void loadIfNeeded(id).catch((err) => {
    console.error('[local-llm] hold-time warmup failed:', err);
  });
  return { holderId };
}

async function release(holderId: string): Promise<void> {
  if (!holderId) return;
  modelHolders.delete(holderId);
  if (modelHolders.size > 0) return;
  const settings = loadAppSettings();
  if (settings.ai.keepModelLoaded) return;
  if (isFakeMode()) return;
  await evictLoaded();
}

async function inferStream(
  req: AIInferRequest,
  signal: AbortSignal,
  onToken: (delta: string) => void,
  settings: AppSettings,
): Promise<void> {
  const id = settings.ai.selectedModelId;
  if (!id || !settings.ai.downloadedModels[id]) {
    throw new Error('No model selected or downloaded.');
  }
  if (idleTimer) clearTimeout(idleTimer);

  let session: InstanceType<
    NonNullable<LlamaModule>['LlamaChatSession']
  > | null = null;
  try {
    if (!llamaModule) {
      llamaModule = (await import('node-llama-cpp')) as LlamaModule;
    }
    const { context } = await loadIfNeeded(id);
    const sequence = context.getSequence();
    session = new llamaModule.LlamaChatSession({
      contextSequence: sequence,
      systemPrompt: req.system,
      // Without this, each session leaks a context sequence — the second
      // generation hits "no sequences left" because the default context
      // only allocates one. With autoDisposeSequence: true, dispose()
      // releases the sequence back to the pool.
      autoDisposeSequence: true,
    });

    await session.prompt(req.prompt, {
      maxTokens: req.maxTokens ?? settings.ai.maxTokens,
      temperature: req.temperature ?? settings.ai.temperature,
      signal,
      stopOnAbortSignal: true,
      customStopTriggers: req.stop,
      onTextChunk: (text: string) => {
        onToken(text);
      },
    });
  } finally {
    try {
      session?.dispose();
    } catch {
      // ignore
    }
    scheduleIdleEviction();
  }
}

export const provider: AIProvider = {
  isReady,
  warmup,
  release,
  inferStream,
};
