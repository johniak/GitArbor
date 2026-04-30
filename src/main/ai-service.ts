/**
 * Main-process AI orchestrator: holds the inference queue, request-id /
 * abort-controller mapping, per-window token routing, and the public IPC
 * surface. Actual inference is delegated to one of three providers in
 * `src/main/ai-providers/` chosen by `settings.ai.source`.
 *
 * Local-only operations (hardware probe, GGUF download, listModels,
 * hold/release for warmup) are forwarded directly to the local-llm
 * provider — they're meaningful only when `source === 'local-llm'`.
 */

import type { WebContents } from 'electron';
import { IPC } from '../shared/ipc';
import {
  type AIDownloadOpts,
  type AIInferRequest,
  type AITokenEvent,
  type HardwareInfo,
  type ModelEntry,
  type SourceReadyInfo,
} from '../shared/ai-types';
import { loadAppSettings } from './app-settings';
import { getProvider } from './ai-providers';
import * as localLlm from './ai-providers/local-llm';

const inferAborts = new Map<string, AbortController>();
const inferQueue: Array<() => Promise<void>> = [];
let inferRunning = false;

function isFakeMode(): boolean {
  return process.env.AI_E2E_FAKE === '1';
}

function sendToken(sender: WebContents, event: AITokenEvent): void {
  if (sender.isDestroyed()) return;
  sender.send(IPC.AI_INFER_TOKEN, event);
}

export async function init(dir: string): Promise<void> {
  await localLlm.init(dir);
}

// ── Local-LLM only forwarders ───────────────────────────────────────
// These are exposed via IPC unconditionally; the AIPage UI only calls
// them when `source === 'local-llm'`. Other sources surface their own
// readiness/error UX via `getSourceReady()`.

export const getHardwareInfo = (): Promise<HardwareInfo> =>
  localLlm.getHardwareInfo();
export const listModels = (): Promise<ModelEntry[]> => localLlm.listModels();
export const downloadModel = (
  opts: AIDownloadOpts,
): Promise<{ id: string; error?: string }> => localLlm.downloadModel(opts);
export const cancelDownload = (id: string): Promise<void> =>
  localLlm.cancelDownload(id);
export const removeModel = (id: string): Promise<void> =>
  localLlm.removeModel(id);

// ── Hold/release: dispatched to the active provider ─────────────────

export async function holdModel(): Promise<{
  holderId: string;
  error?: string;
}> {
  const settings = loadAppSettings();
  if (!settings.ai.enabled) return { holderId: '', error: 'AI disabled' };
  const provider = getProvider(settings.ai.source);
  if (!provider.warmup) return { holderId: '' };
  return provider.warmup(settings);
}

export async function releaseModel(holderId: string): Promise<void> {
  if (!holderId) return;
  const settings = loadAppSettings();
  const provider = getProvider(settings.ai.source);
  if (!provider.release) return;
  return provider.release(holderId);
}

// ── Source-ready probe ─────────────────────────────────────────────

export async function getSourceReady(): Promise<SourceReadyInfo> {
  const settings = loadAppSettings();
  if (!settings.ai.enabled) {
    return {
      ready: false,
      source: settings.ai.source,
      reason: 'AI disabled',
    };
  }
  const provider = getProvider(settings.ai.source);
  return provider.isReady(settings);
}

// ── Inference ──────────────────────────────────────────────────────

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
  const provider = getProvider(settings.ai.source);
  try {
    await provider.inferStream(
      req,
      signal,
      (delta) => sendToken(sender, { requestId, type: 'token', delta }),
      settings,
    );
    if (signal.aborted) {
      sendToken(sender, { requestId, type: 'done', reason: 'cancelled' });
    } else {
      sendToken(sender, { requestId, type: 'done', reason: 'finished' });
    }
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
  for (const ac of inferAborts.values()) ac.abort();
  await localLlm.shutdown();
}

// Re-export buildCustomId for the existing unit test (`ai-service.test.ts`).
export { buildCustomId } from './ai-providers/local-llm';
