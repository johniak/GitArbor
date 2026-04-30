/**
 * Main-process AI service: wraps node-llama-cpp behind a queue-based,
 * cancellable, streaming inference API. Owns the curated-model registry,
 * GGUF download lifecycle, idle eviction, and per-window streaming token
 * delivery.
 *
 * The native binary is loaded lazily via dynamic `import()` so a user with
 * AI disabled never pays the ~100 MB import cost.
 */

import { BrowserWindow } from 'electron';
import type { WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { IPC } from '../shared/ipc';
import {
  CURATED_MODELS,
  type AIDownloadOpts,
  type AIInferRequest,
  type AIStateEvent,
  type AITokenEvent,
  type CuratedModel,
  type DownloadedModelMeta,
  type GpuKind,
  type HardwareInfo,
  type ModelEntry,
  type ModelStatus,
} from '../shared/ai-types';
import { loadAppSettings, updateAppSettings } from './app-settings';

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
const inferAborts = new Map<string, AbortController>();
const inferQueue: Array<() => Promise<void>> = [];
let inferRunning = false;

/**
 * Active "holders" of the loaded model. While the set is non-empty the
 * idle-eviction timer is suspended so a user sitting on the commit view
 * doesn't pay a cold reload when they finally click Generate. When the
 * last holder releases AND `settings.ai.keepModelLoaded` is false, the
 * model is unloaded immediately.
 */
const modelHolders = new Set<string>();

function isFakeMode(): boolean {
  return process.env.AI_E2E_FAKE === '1';
}

function modelsDir(): string {
  if (!userDataDir) throw new Error('ai-service: not initialized');
  return path.join(userDataDir, MODELS_DIR_NAME);
}

function tmpDir(): string {
  return path.join(modelsDir(), TMP_DIR_NAME);
}

function modelFilePath(id: string): string {
  // sanitize: only [a-zA-Z0-9._:-]; replace ':' with '_' so IDs like
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

function sendToken(sender: WebContents, event: AITokenEvent): void {
  if (sender.isDestroyed()) return;
  sender.send(IPC.AI_INFER_TOKEN, event);
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
  // pinning the model in memory. Without that flag we lazy-load on first
  // view entry so users who never use AI don't pay the cost.
  if (settings.ai.enabled && settings.ai.keepModelLoaded && !isFakeMode()) {
    const id = settings.ai.selectedModelId;
    if (id && fs.existsSync(modelFilePath(id))) {
      void loadIfNeeded(id).catch((err) => {
        console.error('[ai-service] startup warmup failed:', err);
      });
    }
  }
}

/** Take a hold on the loaded model. Returns a holder id; while at least
 *  one holder is active the idle-eviction timer is suspended, and the
 *  model load is kicked off in the background if not yet loaded. */
export async function holdModel(): Promise<{
  holderId: string;
  error?: string;
}> {
  const settings = loadAppSettings();
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
  // Background load — don't make the renderer wait for it.
  void loadIfNeeded(id).catch((err) => {
    console.error('[ai-service] hold-time warmup failed:', err);
  });
  return { holderId };
}

/** Release a previously-acquired hold. When the last holder releases AND
 *  the user has not opted into `keepModelLoaded`, evict immediately. */
export async function releaseModel(holderId: string): Promise<void> {
  if (!holderId) return;
  modelHolders.delete(holderId);
  if (modelHolders.size > 0) return;
  const settings = loadAppSettings();
  if (settings.ai.keepModelLoaded) return;
  if (isFakeMode()) return;
  await evictLoaded();
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

function fakeOutputFor(kind: AIInferRequest['kind']): string {
  return kind === 'branch-name'
    ? 'feat/example-branch'
    : 'feat: example commit\n\n- bullet one\n- bullet two';
}

async function runFakeInfer(
  requestId: string,
  req: AIInferRequest,
  sender: WebContents,
  signal: AbortSignal,
): Promise<void> {
  const text = fakeOutputFor(req.kind);
  const tokens = text.match(/.{1,4}/g) ?? [text];
  for (const t of tokens) {
    if (signal.aborted) {
      sendToken(sender, { requestId, type: 'done', reason: 'cancelled' });
      return;
    }
    sendToken(sender, { requestId, type: 'token', delta: t });
    await new Promise((r) => setTimeout(r, 50));
  }
  sendToken(sender, { requestId, type: 'done', reason: 'finished' });
}

async function runRealInfer(
  requestId: string,
  req: AIInferRequest,
  sender: WebContents,
  signal: AbortSignal,
): Promise<void> {
  const settings = loadAppSettings();
  const id = settings.ai.selectedModelId;
  if (!id || !settings.ai.downloadedModels[id]) {
    sendToken(sender, {
      requestId,
      type: 'done',
      reason: 'error',
      error: 'No model selected or downloaded.',
    });
    return;
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
        sendToken(sender, { requestId, type: 'token', delta: text });
      },
    });
    sendToken(sender, { requestId, type: 'done', reason: 'finished' });
  } catch (err) {
    if (signal.aborted) {
      sendToken(sender, { requestId, type: 'done', reason: 'cancelled' });
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      sendToken(sender, {
        requestId,
        type: 'done',
        reason: 'error',
        error: msg,
      });
    }
  } finally {
    try {
      session?.dispose();
    } catch {
      // ignore
    }
    scheduleIdleEviction();
  }
}

function pumpQueue(): void {
  if (inferRunning) return;
  const next = inferQueue.shift();
  if (!next) return;
  inferRunning = true;
  void next().finally(() => {
    inferRunning = false;
    pumpQueue();
  });
}

export async function inferStream(
  req: AIInferRequest,
  sender: WebContents,
): Promise<{ requestId?: string; error?: string }> {
  const settings = loadAppSettings();
  if (!settings.ai.enabled) return { error: 'AI is disabled in Settings.' };
  if (!req.requestId) return { error: 'Missing requestId.' };

  const requestId = req.requestId;
  const ac = new AbortController();
  inferAborts.set(requestId, ac);

  const job = async () => {
    try {
      if (isFakeMode()) {
        await runFakeInfer(requestId, req, sender, ac.signal);
      } else {
        await runRealInfer(requestId, req, sender, ac.signal);
      }
    } finally {
      inferAborts.delete(requestId);
    }
  };
  inferQueue.push(job);
  pumpQueue();
  return { requestId };
}

export async function cancelInfer(requestId: string): Promise<void> {
  const ac = inferAborts.get(requestId);
  if (!ac) return;
  ac.abort();
}

export async function shutdown(): Promise<void> {
  for (const ac of downloadAborts.values()) ac.abort();
  for (const ac of inferAborts.values()) ac.abort();
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  await evictLoaded();
}
