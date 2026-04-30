/**
 * Provider abstraction over the three AI sources (local LLM via
 * node-llama-cpp, locally-installed coding-agent CLI, OpenAI-compatible
 * HTTP). The orchestrator in `src/main/ai-service.ts` holds the request
 * queue + IPC handlers and dispatches the actual inference work to the
 * provider matching `settings.ai.source`.
 */

import type {
  AIInferRequest,
  AISource,
  SourceReadyInfo,
} from '../../shared/ai-types';
import type { AppSettings } from '../../shared/app-settings-types';
import * as localLlm from './local-llm';
import * as codingAgent from './coding-agent';
import * as openaiCompat from './openai-compat';

export interface AIProvider {
  /** Cheap "is this configured + runnable" probe used to gate the UI. */
  isReady(settings: AppSettings): Promise<SourceReadyInfo>;

  /** Optional warmup: load the model into memory ahead of time. Returns a
   *  holder id; while at least one holder is alive `release()` is a no-op
   *  for eviction purposes. Only meaningful for local-llm; the others
   *  return an empty `holderId` immediately. */
  warmup?(settings: AppSettings): Promise<{ holderId: string; error?: string }>;

  /** Pair of `warmup`. Frees resources when no holders remain (and the
   *  user hasn't pinned the model in memory). No-op for non-local. */
  release?(holderId: string): Promise<void>;

  /** Stream tokens through `onToken`. Honour `signal` for cancellation.
   *  Throws on transport errors; the caller maps them to `done/error`
   *  IPC events. */
  inferStream(
    req: AIInferRequest,
    signal: AbortSignal,
    onToken: (delta: string) => void,
    settings: AppSettings,
  ): Promise<void>;
}

export function getProvider(source: AISource): AIProvider {
  switch (source) {
    case 'local-llm':
      return localLlm.provider;
    case 'coding-agent':
      return codingAgent.provider;
    case 'openai-compat':
      return openaiCompat.provider;
  }
}
