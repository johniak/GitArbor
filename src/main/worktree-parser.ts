/**
 * Parser for `git worktree list --porcelain` output.
 *
 * Format (one block per worktree, blank-line separator between blocks):
 *
 *   worktree <path>
 *   HEAD <commit-sha>            (omitted for bare main)
 *   branch refs/heads/<name>     (mutually exclusive with `detached`)
 *   detached
 *   locked [<reason>]            (optional)
 *   prunable [<reason>]          (optional)
 *   bare                         (optional, on the main entry only)
 *
 * The first block in the output is conventionally the "main" worktree —
 * the one containing the real `.git/` directory. We surface that as
 * `isMain: true` on the first entry.
 */

import type { Worktree } from '../renderer/types';

export function parseWorktreePorcelain(stdout: string): Worktree[] {
  // Blocks separated by blank lines. Trim the whole stdout to drop the
  // trailing newline that git always emits.
  const blocks = stdout
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.map((block, idx) => parseBlock(block, idx === 0));
}

function parseBlock(block: string, isFirst: boolean): Worktree {
  const wt: Worktree = {
    path: '',
    head: '',
    isDetached: false,
    isMain: isFirst,
    isBare: false,
    locked: false,
    prunable: false,
  };

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('worktree ')) {
      wt.path = line.slice('worktree '.length);
    } else if (line.startsWith('HEAD ')) {
      wt.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length);
      wt.branch = ref.startsWith('refs/heads/')
        ? ref.slice('refs/heads/'.length)
        : ref;
    } else if (line === 'detached') {
      wt.isDetached = true;
    } else if (line === 'bare') {
      wt.isBare = true;
    } else if (line === 'locked' || line.startsWith('locked ')) {
      wt.locked = true;
      const reason = line.slice('locked'.length).trim();
      if (reason) wt.lockReason = reason;
    } else if (line === 'prunable' || line.startsWith('prunable ')) {
      wt.prunable = true;
      const reason = line.slice('prunable'.length).trim();
      if (reason) wt.prunableReason = reason;
    }
    // Unknown keys are ignored — git may add more in future.
  }

  return wt;
}
