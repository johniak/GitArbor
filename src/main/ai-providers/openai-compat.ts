/**
 * OpenAI-compatible HTTP provider. Speaks the chat-completions streaming
 * SSE format (`/v1/chat/completions` with `stream: true`). Works with
 * OpenAI itself, OpenRouter, Groq, Together, vLLM, LM Studio, and Ollama
 * in OpenAI-compat mode — same wire protocol.
 *
 * Cancellation: AbortController on the fetch — Node's fetch propagates
 * abort into the underlying socket.
 */

import type { AIInferRequest, SourceReadyInfo } from '../../shared/ai-types';
import type { AppSettings } from '../../shared/app-settings-types';
import type { AIProvider } from './index';

interface OpenAIChunkChoice {
  delta?: { content?: string };
  finish_reason?: string | null;
}

interface OpenAIChunk {
  choices?: OpenAIChunkChoice[];
}

/**
 * Pull `choices[0].delta.content` out of a parsed SSE chunk. Returns
 * the text delta or empty string if this chunk has no text (e.g. it's
 * a role declaration or the final stop chunk).
 */
export function extractContentFromChunk(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object') return '';
  const c = chunk as OpenAIChunk;
  if (!Array.isArray(c.choices) || c.choices.length === 0) return '';
  const text = c.choices[0]?.delta?.content;
  return typeof text === 'string' ? text : '';
}

/**
 * Buffer an SSE byte stream into discrete `data: ...` events. Emits the
 * payload (the part after `data: `) for each event. Emits the literal
 * string `[DONE]` for the OpenAI sentinel so the caller can stop.
 *
 * Returns a feeder that takes the next chunk of text. Handles split
 * events across chunks (\n\n boundary buffered).
 */
export function makeSseParser(
  onEvent: (payload: string) => void,
): (chunk: string) => void {
  let buf = '';
  return (chunk: string) => {
    buf += chunk;
    while (true) {
      const end = buf.indexOf('\n\n');
      if (end === -1) break;
      const event = buf.slice(0, end);
      buf = buf.slice(end + 2);
      const lines = event.split('\n');
      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trimStart();
        if (!payload) continue;
        onEvent(payload);
      }
    }
  };
}

async function isReady(settings: AppSettings): Promise<SourceReadyInfo> {
  const url = settings.ai.openAIBaseUrl?.trim();
  const model = settings.ai.openAIModel?.trim();
  const key = settings.ai.openAIApiKey?.trim();
  const missing: string[] = [];
  if (!url) missing.push('Base URL');
  if (!model) missing.push('Model');
  if (!key) missing.push('API key');
  if (missing.length > 0) {
    return {
      ready: false,
      source: 'openai-compat',
      reason: `${missing.join(', ')} not set`,
    };
  }
  if (!/^https?:\/\//.test(url)) {
    return {
      ready: false,
      source: 'openai-compat',
      reason: 'Base URL must start with http(s)://',
    };
  }
  return { ready: true, source: 'openai-compat' };
}

async function inferStream(
  req: AIInferRequest,
  signal: AbortSignal,
  onToken: (delta: string) => void,
  settings: AppSettings,
): Promise<void> {
  const baseUrl = settings.ai.openAIBaseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/v1/chat/completions`;
  const body = {
    model: settings.ai.openAIModel,
    stream: true,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt },
    ],
    max_tokens: req.maxTokens ?? settings.ai.maxTokens,
    temperature: req.temperature ?? settings.ai.temperature,
    ...(req.stop && req.stop.length > 0 ? { stop: req.stop } : {}),
  };

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.ai.openAIApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new Error(
      `HTTP ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 500)}` : ''}`,
    );
  }

  let done = false;
  const parse = makeSseParser((payload) => {
    if (done) return;
    if (payload === '[DONE]') {
      done = true;
      return;
    }
    try {
      const obj: unknown = JSON.parse(payload);
      const text = extractContentFromChunk(obj);
      if (text) onToken(text);
    } catch {
      // Bad JSON — skip this event.
    }
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (!done) {
    const { value, done: readerDone } = await reader.read();
    if (readerDone) break;
    if (value) parse(decoder.decode(value, { stream: true }));
    if (signal.aborted) break;
  }
}

export const provider: AIProvider = {
  isReady,
  inferStream,
};
