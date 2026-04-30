/**
 * Shared AI types: the curated model registry, AI settings schema, the
 * renderer-callable AI API surface, and the IPC payload shapes for the
 * streaming token / state-event push channels.
 *
 * Single source of truth for both `src/main/ai-service.ts` and the renderer.
 */

export type AIModelFamily =
  | 'qwen'
  | 'qwen-coder'
  | 'deepseek-coder'
  | 'gemma'
  | 'llama'
  | 'phi'
  | 'custom';

export interface CuratedModel {
  id: string;
  name: string;
  family: AIModelFamily;
  /** Approximate file size in bytes — used as a hint until the actual
   *  Content-Length is known at download time. */
  sizeBytes: number;
  contextWindow: number;
  url: string;
}

/**
 * The hardcoded curated list shown in the Settings → AI tab.
 *
 * Sizes and URLs are pinned to specific Q4_K_M quantizations from
 * widely-mirrored HuggingFace repositories. They can be re-tuned by the
 * implementer when verifying the URLs at install time.
 */
export const CURATED_MODELS: readonly CuratedModel[] = [
  {
    id: 'qwen-3.5-0.8b-q4',
    name: 'Qwen 3.5 0.8B-Instruct (Q4)',
    family: 'qwen',
    sizeBytes: 530 * 1024 * 1024,
    contextWindow: 32_768,
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'qwen-2.5-coder-1.5b-q4',
    name: 'Qwen 2.5 Coder 1.5B-Instruct (Q4)',
    family: 'qwen-coder',
    sizeBytes: 1_000 * 1024 * 1024,
    contextWindow: 32_768,
    url: 'https://huggingface.co/bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'deepseek-coder-1.3b-q4',
    name: 'DeepSeek-Coder 1.3B-Instruct (Q4)',
    family: 'deepseek-coder',
    sizeBytes: 800 * 1024 * 1024,
    contextWindow: 16_384,
    url: 'https://huggingface.co/TheBloke/deepseek-coder-1.3b-instruct-GGUF/resolve/main/deepseek-coder-1.3b-instruct.Q4_K_M.gguf',
  },
  {
    id: 'qwen-2.5-coder-3b-q4',
    name: 'Qwen 2.5 Coder 3B-Instruct (Q4)',
    family: 'qwen-coder',
    sizeBytes: 1_900 * 1024 * 1024,
    contextWindow: 32_768,
    url: 'https://huggingface.co/bartowski/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf',
  },
  {
    // Gemma 4 architecture isn't supported by the llama.cpp build bundled
    // in node-llama-cpp 3.18.1 (b8390). Swap back to gemma-4-e4b-q4 once
    // node-llama-cpp ships a newer llama.cpp release.
    id: 'gemma-2-2b-q4',
    name: 'Gemma 2 2B-it (Q4)',
    family: 'gemma',
    sizeBytes: 1_700 * 1024 * 1024,
    contextWindow: 8_192,
    url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
  },
  {
    id: 'llama-3.2-3b-q4',
    name: 'Llama 3.2 3B-Instruct (Q4)',
    family: 'llama',
    sizeBytes: 2_000 * 1024 * 1024,
    contextWindow: 32_768,
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'phi-3.5-mini-q4',
    name: 'Phi 3.5-mini-Instruct (Q4)',
    family: 'phi',
    sizeBytes: 2_400 * 1024 * 1024,
    contextWindow: 32_768,
    url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
  },
] as const;

export const DEFAULT_MODEL_ID = 'qwen-2.5-coder-1.5b-q4';

export interface DownloadedModelMeta {
  id: string;
  /** Filename on disk under `userData/models/`. */
  filename: string;
  sizeBytes: number;
  sourceUrl: string;
  downloadedAt: number;
  isCustom: boolean;
  /** Human label for custom models — for curated, this is the curated name. */
  label: string;
  contextWindow: number;
  sha256?: string;
}

/** Which AI backend powers the Generate buttons. One global active source
 *  per app — both branch name and commit message use the same one. */
export type AISource = 'local-llm' | 'coding-agent' | 'openai-compat';

/** When `source === 'coding-agent'` we shell out to one of these CLIs. */
export type CodingAgentTool = 'codex' | 'claude';

export interface AISettings {
  enabled: boolean;
  /** Active source for both Generate features. */
  source: AISource;
  // ── local-llm ──────────────────────────────────────────────────
  selectedModelId: string;
  /** Only used when `selectedModelId === 'custom'` and the user has typed
   *  a URL but not yet downloaded. Persisted so they don't lose what they
   *  typed when the Settings window closes. */
  customGgufUrl: string;
  /** Map of model id → metadata for downloaded files. */
  downloadedModels: Record<string, DownloadedModelMeta>;
  /**
   * When true, the model stays loaded in GPU/RAM for the lifetime of the
   * app session — first generation after enabling AI is slow but every
   * subsequent one starts immediately. When false, the model is loaded on
   * demand (when the user enters the commit view or opens the New Branch
   * dialog) and unloaded when they leave, freeing the memory.
   */
  keepModelLoaded: boolean;
  // ── coding-agent ───────────────────────────────────────────────
  codingAgentTool: CodingAgentTool;
  /** Optional explicit binary path. Empty string means "find on PATH". */
  codingAgentBinaryPath: string;
  // ── openai-compat ──────────────────────────────────────────────
  openAIBaseUrl: string;
  openAIModel: string;
  openAIApiKey: string;
  // ── shared inference params ────────────────────────────────────
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  source: 'local-llm',
  selectedModelId: DEFAULT_MODEL_ID,
  customGgufUrl: '',
  downloadedModels: {},
  keepModelLoaded: false,
  codingAgentTool: 'claude',
  codingAgentBinaryPath: '',
  openAIBaseUrl: 'https://api.openai.com',
  openAIModel: 'gpt-4o-mini',
  openAIApiKey: '',
  temperature: 0.2,
  maxTokens: 256,
};

export type GpuKind = 'metal' | 'cuda' | 'vulkan' | 'cpu';

export interface HardwareInfo {
  gpu: GpuKind;
  gpuName?: string;
  vramMB?: number;
  ramMB: number;
}

export type ModelStatus = 'not-downloaded' | 'downloading' | 'ready' | 'error';

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number;
  bytesPerSec: number;
}

export interface ModelEntry {
  id: string;
  name: string;
  family: AIModelFamily;
  sizeBytes: number;
  contextWindow: number;
  url: string;
  status: ModelStatus;
  downloadProgress?: DownloadProgress;
  error?: string;
  isCustom: boolean;
}

export type AIInferKind = 'branch-name' | 'commit-message';

export interface AIInferRequest {
  /** Renderer-generated UUID. Required so the renderer can subscribe its
   *  filter listener BEFORE issuing the IPC call, eliminating a race where
   *  early `done` events (e.g. errors) arrive before the invoke promise
   *  resolves with the request id. */
  requestId: string;
  kind: AIInferKind;
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
}

export type AITokenEvent =
  | { requestId: string; type: 'token'; delta: string }
  | {
      requestId: string;
      type: 'done';
      reason: 'finished' | 'cancelled' | 'error';
      error?: string;
    };

export type AIStateEvent =
  | {
      type: 'download-progress';
      id: string;
      receivedBytes: number;
      totalBytes: number;
      bytesPerSec: number;
    }
  | { type: 'download-complete'; id: string }
  | { type: 'download-error'; id: string; error: string }
  | { type: 'model-ready'; id: string }
  | { type: 'model-unloaded'; id: string };

export interface AIDownloadOpts {
  id: string;
  /** Required when `id === 'custom'`. */
  url?: string;
  /** Required when `id === 'custom'`. Free-text human label. */
  label?: string;
}

/** Probe result for whether the active source is configured & runnable. */
export interface SourceReadyInfo {
  ready: boolean;
  source: AISource;
  /** Human-readable reason when `ready === false` (e.g. "Model not
   *  downloaded", "claude CLI not found in PATH", "API key missing"). */
  reason?: string;
  /** For coding-agent: resolved absolute path to the binary, when found. */
  resolvedPath?: string;
}

export interface AIAPI {
  getHardwareInfo(): Promise<HardwareInfo>;
  listModels(): Promise<ModelEntry[]>;
  downloadModel(opts: AIDownloadOpts): Promise<{ id: string; error?: string }>;
  cancelDownload(id: string): Promise<void>;
  removeModel(id: string): Promise<void>;
  inferStream(req: AIInferRequest): Promise<{
    requestId?: string;
    error?: string;
  }>;
  cancelInfer(requestId: string): Promise<void>;
  /**
   * Take a "hold" on the loaded model. While at least one hold is active
   * the model is kept warm (no idle eviction). Returns a holder id used
   * to release later. Resolves with empty `holderId` + `error` if AI is
   * disabled or no model is downloaded.
   *
   * For non-local sources this is a no-op (returns empty `holderId`).
   */
  holdModel(): Promise<{ holderId: string; error?: string }>;
  /** Release a previous `holdModel()`. When the last holder releases AND
   *  `keepModelLoaded` is false, the model is unloaded immediately. */
  releaseModel(holderId: string): Promise<void>;
  /** Cheap probe: is the currently-selected source configured & runnable? */
  getSourceReady(): Promise<SourceReadyInfo>;
  onToken(cb: (event: AITokenEvent) => void): () => void;
  onState(cb: (event: AIStateEvent) => void): () => void;
}
