/**
 * Coding-agent provider: shells out to a locally-installed CLI (Claude
 * Code's `claude` or OpenAI's `codex`) and streams its stdout back as
 * tokens. The agent already has its own auth/quota; we just hand it a
 * concatenated system+user prompt and parse its line-delimited JSON
 * output for assistant text deltas.
 *
 * Cancellation: SIGTERM, then SIGKILL after a 500 ms grace.
 *
 * References:
 *  - Claude Code headless mode: https://code.claude.com/docs/en/headless
 *  - OpenAI Codex CLI: https://github.com/openai/codex
 */

import { spawn, execSync, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import path from 'node:path';
import type {
  AIInferRequest,
  CodingAgentTool,
  SourceReadyInfo,
} from '../../shared/ai-types';
import type { AppSettings } from '../../shared/app-settings-types';
import type { AIProvider } from './index';

const SIGKILL_GRACE_MS = 500;

interface ResolvedBinary {
  path: string;
  tool: CodingAgentTool;
}

function resolveBinary(settings: AppSettings): ResolvedBinary | null {
  const tool = settings.ai.codingAgentTool;
  // Explicit user-provided path wins.
  const explicit = settings.ai.codingAgentBinaryPath?.trim();
  if (explicit) return { path: explicit, tool };
  const cmd = tool === 'codex' ? 'codex' : 'claude';
  try {
    const found = execSync(`command -v ${cmd}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    }).trim();
    if (found) return { path: found, tool };
  } catch {
    // not found
  }
  return null;
}

function buildArgs(tool: CodingAgentTool, fullPrompt: string): string[] {
  if (tool === 'claude') {
    // Claude Code: non-interactive, NDJSON event stream.
    return ['-p', fullPrompt, '--output-format', 'stream-json', '--verbose'];
  }
  // Codex CLI exec mode with JSON output.
  return ['exec', '--json', fullPrompt];
}

/**
 * Pull text deltas out of one JSON object emitted by the agent CLI.
 * Both Claude Code and Codex emit nested event shapes; we look at a
 * handful of well-known paths and ignore everything else.
 */
export function extractDeltaFromJson(obj: unknown): string {
  if (!obj || typeof obj !== 'object') return '';
  const o = obj as Record<string, unknown>;

  // Anthropic-style delta: `{ type: 'content_block_delta', delta: { text } }`
  if (o.type === 'content_block_delta') {
    const delta = o.delta as { text?: string } | undefined;
    if (typeof delta?.text === 'string') return delta.text;
  }

  // Claude Code "stream-json" emits `{ type: 'assistant', message: { content: [{ type: 'text', text }] } }`
  if (o.type === 'assistant' && o.message && typeof o.message === 'object') {
    const msg = o.message as { content?: unknown };
    if (Array.isArray(msg.content)) {
      const parts: string[] = [];
      for (const block of msg.content) {
        if (
          block &&
          typeof block === 'object' &&
          (block as { type?: string }).type === 'text' &&
          typeof (block as { text?: string }).text === 'string'
        ) {
          parts.push((block as { text: string }).text);
        }
      }
      if (parts.length > 0) return parts.join('');
    }
  }

  // Codex-style: `{ type: 'agent_message_delta' | 'response.text.delta', delta }`
  if (
    (o.type === 'agent_message_delta' || o.type === 'response.text.delta') &&
    typeof o.delta === 'string'
  ) {
    return o.delta;
  }
  // Some Codex events: `{ msg: { type: 'agent_message_delta', delta } }`
  if (o.msg && typeof o.msg === 'object') {
    const inner = o.msg as { type?: string; delta?: unknown };
    if (
      (inner.type === 'agent_message_delta' ||
        inner.type === 'response.text.delta') &&
      typeof inner.delta === 'string'
    ) {
      return inner.delta;
    }
  }

  return '';
}

/**
 * Buffer NDJSON stdout: split on newlines, attempt JSON.parse on each
 * complete line, hand the parsed object to `onLine`. Incomplete trailing
 * data is kept in the buffer for the next chunk.
 */
export function makeNdjsonParser(
  onLine: (parsed: unknown) => void,
): (chunk: string) => void {
  let buf = '';
  return (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        onLine(JSON.parse(line));
      } catch {
        // Some CLIs emit non-JSON status text on stderr; treat malformed
        // stdout lines as opaque and skip — final result will still
        // surface from a later well-formed event or from stderr.
      }
    }
  };
}

async function isReady(settings: AppSettings): Promise<SourceReadyInfo> {
  const resolved = resolveBinary(settings);
  if (!resolved) {
    const tool = settings.ai.codingAgentTool;
    return {
      ready: false,
      source: 'coding-agent',
      reason: `${tool === 'codex' ? 'codex' : 'claude'} CLI not found in PATH. Install it or set an explicit path.`,
    };
  }
  return {
    ready: true,
    source: 'coding-agent',
    resolvedPath: resolved.path,
  };
}

async function inferStream(
  req: AIInferRequest,
  signal: AbortSignal,
  onToken: (delta: string) => void,
  settings: AppSettings,
): Promise<void> {
  const resolved = resolveBinary(settings);
  if (!resolved) {
    throw new Error(
      `${settings.ai.codingAgentTool} CLI not found in PATH (or at the configured path).`,
    );
  }
  const cwd = process.env.REPO_PATH || process.cwd();
  const fullPrompt = `${req.system}\n\n${req.prompt}`;
  const args = buildArgs(resolved.tool, fullPrompt);

  let child: ChildProcessByStdio<null, Readable, Readable>;
  try {
    child = spawn(resolved.path, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    throw new Error(
      `Failed to spawn ${path.basename(resolved.path)}: ${
        e instanceof Error ? e.message : String(e)
      }`,
      { cause: e },
    );
  }

  let stderrBuf = '';
  const parse = makeNdjsonParser((obj) => {
    const delta = extractDeltaFromJson(obj);
    if (delta) onToken(delta);
  });

  child.stdout.setEncoding('utf-8');
  child.stderr.setEncoding('utf-8');
  child.stdout.on('data', parse);
  child.stderr.on('data', (chunk: string) => {
    stderrBuf += chunk;
    if (stderrBuf.length > 16 * 1024) {
      stderrBuf = stderrBuf.slice(-16 * 1024); // bound it
    }
  });

  const onAbort = () => {
    if (child.killed) return;
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed && child.exitCode === null) {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }, SIGKILL_GRACE_MS);
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });

  await new Promise<void>((resolve, reject) => {
    child.on('error', (err) => {
      reject(err);
    });
    child.on('close', (code, sigName) => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) {
        // Cancellation is reported by the orchestrator via signal.aborted.
        resolve();
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      const msg = stderrBuf.trim() || `exit ${code ?? sigName}`;
      reject(new Error(msg));
    });
  });
}

export const provider: AIProvider = {
  isReady,
  inferStream,
};
