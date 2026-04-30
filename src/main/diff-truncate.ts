/**
 * Bound a multi-file staged diff so it fits inside a small-LLM context.
 *
 * Recipe (applied in order):
 *  1. Files matching the binary / lockfile / build-output deny-list collapse
 *     to a one-line summary.
 *  2. Per-hunk cap: if a hunk has more than `MAX_HUNK_LINES` lines, keep
 *     `HEAD_TAIL_LINES` from each end and elide the middle.
 *  3. Per-file cap: if the file's serialised diff exceeds `MAX_FILE_BYTES`,
 *     keep the first two hunks and elide the rest.
 *  4. Total cap: when the running output exceeds `MAX_TOTAL_BYTES`, every
 *     remaining file collapses to a one-line summary.
 */

import type { FileDiff } from '../renderer/types';

export interface DiffInput {
  path: string;
  diff: FileDiff;
}

export interface TruncationMeta {
  filesIncluded: number;
  filesOmitted: number;
  bytesOriginal: number;
  bytesAfter: number;
}

export interface TruncationResult {
  truncatedDiff: string;
  meta: TruncationMeta;
}

const MAX_FILE_BYTES = 4 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024;
const MAX_HUNK_LINES = 200;
const HEAD_TAIL_LINES = 80;
const KEEP_FIRST_HUNKS = 2;

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'pdf',
  'zip',
  'gz',
  'tar',
  'wasm',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'mp3',
  'mp4',
  'mov',
  'webm',
]);

const DENY_PATH_SUFFIXES = [
  '.lock',
  'package-lock.json',
  'bun.lock',
  'yarn.lock',
  'pnpm-lock.yaml',
];

const DENY_PATH_FRAGMENTS = ['dist/', 'build/', '.next/', '.cache/'];

function isBinaryOrGenerated(path: string): boolean {
  const lower = path.toLowerCase();
  if (DENY_PATH_SUFFIXES.some((s) => lower.endsWith(s))) return true;
  if (
    DENY_PATH_FRAGMENTS.some(
      (f) => lower.startsWith(f) || lower.includes(`/${f}`),
    )
  ) {
    return true;
  }
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = lower.slice(dot + 1);
  return BINARY_EXTENSIONS.has(ext);
}

function statusVerb(status: FileDiff['status']): string {
  switch (status) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'U':
      return 'unmerged';
    case 'M':
    default:
      return 'modified';
  }
}

function truncateHunkLines(lines: string[]): string[] {
  if (lines.length <= MAX_HUNK_LINES) return lines;
  const head = lines.slice(0, HEAD_TAIL_LINES);
  const tail = lines.slice(-HEAD_TAIL_LINES);
  const omitted = lines.length - head.length - tail.length;
  return [...head, `... <${omitted} lines omitted>`, ...tail];
}

function renderDiffLine(
  content: string,
  type: 'added' | 'removed' | 'context',
): string {
  const prefix = type === 'added' ? '+' : type === 'removed' ? '-' : ' ';
  return `${prefix}${content}`;
}

function renderFile(input: DiffInput): string {
  const { path, diff } = input;
  if (diff.binary) return `<binary>: ${path} (${statusVerb(diff.status)})`;

  const header = `diff --git a/${path} b/${path}`;
  const headLines: string[] = [header];

  const hunksToRender = diff.hunks.slice(0, KEEP_FIRST_HUNKS * 100);
  for (let i = 0; i < hunksToRender.length; i++) {
    const hunk = hunksToRender[i];
    const lines = hunk.lines.map((l) => renderDiffLine(l.content, l.type));
    const capped = truncateHunkLines(lines);
    headLines.push(hunk.header);
    headLines.push(...capped);
  }
  let body = headLines.join('\n');

  if (body.length > MAX_FILE_BYTES) {
    const keptHunks = diff.hunks.slice(0, KEEP_FIRST_HUNKS);
    const elidedCount = diff.hunks.length - keptHunks.length;
    const reduced: string[] = [header];
    for (const hunk of keptHunks) {
      const lines = hunk.lines.map((l) => renderDiffLine(l.content, l.type));
      const capped = truncateHunkLines(lines);
      reduced.push(hunk.header);
      reduced.push(...capped);
    }
    if (elidedCount > 0)
      reduced.push(`... <${elidedCount} more hunks omitted>`);
    body = reduced.join('\n');
    if (body.length > MAX_FILE_BYTES) {
      // Hard cap — chop the trailing tail off the rendered file.
      body = body.slice(0, MAX_FILE_BYTES) + '\n... <truncated>';
    }
  }
  return body;
}

/**
 * Order files: deletions and modifications first (most informative for a
 * commit message), then renames/copies, then additions last (additions tend
 * to be huge for new files).
 */
function priority(status: FileDiff['status']): number {
  switch (status) {
    case 'D':
      return 0;
    case 'M':
      return 1;
    case 'R':
      return 2;
    case 'C':
      return 3;
    case 'A':
      return 4;
    default:
      return 5;
  }
}

export function truncateDiffsForCommitMessage(
  files: DiffInput[],
): TruncationResult {
  const sorted = [...files].sort((a, b) => {
    const pa = priority(a.diff.status);
    const pb = priority(b.diff.status);
    if (pa !== pb) return pa - pb;
    return a.path.localeCompare(b.path);
  });

  let bytesOriginal = 0;
  for (const f of sorted) {
    if (f.diff.binary) continue;
    for (const h of f.diff.hunks) {
      bytesOriginal += h.header.length + 1;
      for (const l of h.lines) bytesOriginal += l.content.length + 2;
    }
  }

  const parts: string[] = [];
  let total = 0;
  let included = 0;
  let omitted = 0;

  for (const f of sorted) {
    let rendered: string;
    if (isBinaryOrGenerated(f.path)) {
      rendered = `<skipped>: ${f.path} (${statusVerb(f.diff.status)})`;
    } else {
      rendered = renderFile(f);
    }
    if (total + rendered.length > MAX_TOTAL_BYTES && included > 0) {
      omitted++;
      parts.push(
        `<${f.path}>: ${statusVerb(f.diff.status)} (omitted, total budget reached)`,
      );
      total += parts[parts.length - 1].length;
      continue;
    }
    parts.push(rendered);
    total += rendered.length + 1;
    included++;
  }

  const truncatedDiff = parts.join('\n\n');
  return {
    truncatedDiff,
    meta: {
      filesIncluded: included,
      filesOmitted: omitted,
      bytesOriginal,
      bytesAfter: truncatedDiff.length,
    },
  };
}
