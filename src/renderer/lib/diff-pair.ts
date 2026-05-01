/**
 * Pure helpers that turn a unified hunk into split-view rows and compute
 * word-level diffs between paired modification lines.
 *
 * Why split here and not in `DiffViewer.svelte`: the pairing is testable
 * algorithm code, not Svelte. Keeping it pure also lets us call it from
 * other places (e.g. a future "compare two commits" view) without
 * dragging UI deps along.
 */

import { diffWords } from 'diff';
import type { DiffHunk, DiffLine, DiffLineType } from '../types';

export type SplitCellKind = 'added' | 'removed' | 'context' | 'empty';

export interface SplitCell {
  /** Line number in the original/new file. `null` for empty cells and
   *  for the side that doesn't have a line at this row. */
  lineNum: number | null;
  /** The line's text. Empty string for empty cells. */
  content: string;
  kind: SplitCellKind;
  /** Index back into `hunk.lines[]` so we can correlate clicks with the
   *  unified line model when needed. `null` for empty cells. */
  originalIndex: number | null;
}

export interface SplitRow {
  left: SplitCell;
  right: SplitCell;
  /** Both sides are non-empty modifications (`-` paired with `+`).
   *  Word-diff applies only to these rows. */
  isModificationPair: boolean;
}

const EMPTY_CELL: SplitCell = {
  lineNum: null,
  content: '',
  kind: 'empty',
  originalIndex: null,
};

function cellFrom(
  line: DiffLine,
  originalIndex: number,
  side: 'left' | 'right',
): SplitCell {
  // For context lines, both sides show the same content but pick the
  // appropriate line number per side.
  const lineNum =
    line.type === 'context'
      ? side === 'left'
        ? line.oldLine
        : line.newLine
      : line.type === 'removed'
        ? line.oldLine
        : line.newLine;
  return {
    lineNum,
    content: line.content,
    kind: line.type,
    originalIndex,
  };
}

/**
 * Walk a hunk and emit one SplitRow per visual row in split view.
 *
 * Algorithm:
 *  - Context lines render identically on both sides.
 *  - A run of `removed` followed by a run of `added` (the standard
 *    unified-diff order) is paired up: row k matches removed[k] with
 *    added[k]. Trailing unmatched lines fill the longer side and leave
 *    the other empty.
 *  - Pure-deletion or pure-addition runs (no opposite type follows)
 *    expand on their side only with empty cells on the other.
 */
export function pairLinesForSplit(hunk: DiffHunk): SplitRow[] {
  const out: SplitRow[] = [];
  const lines = hunk.lines;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type === 'context') {
      out.push({
        left: cellFrom(line, i, 'left'),
        right: cellFrom(line, i, 'right'),
        isModificationPair: false,
      });
      i++;
      continue;
    }

    // Collect a run of removeds, then a run of addeds. `+` followed by
    // `-` (very rare) gets handled by treating each run independently:
    // the first run is the only one collected here, and the next
    // iteration of the outer loop picks up whatever comes after.
    const removed: Array<{ idx: number; line: DiffLine }> = [];
    while (i < lines.length && lines[i].type === 'removed') {
      removed.push({ idx: i, line: lines[i] });
      i++;
    }
    const added: Array<{ idx: number; line: DiffLine }> = [];
    while (i < lines.length && lines[i].type === 'added') {
      added.push({ idx: i, line: lines[i] });
      i++;
    }

    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < pairs; k++) {
      out.push({
        left: cellFrom(removed[k].line, removed[k].idx, 'left'),
        right: cellFrom(added[k].line, added[k].idx, 'right'),
        isModificationPair: true,
      });
    }
    for (let k = pairs; k < removed.length; k++) {
      out.push({
        left: cellFrom(removed[k].line, removed[k].idx, 'left'),
        right: EMPTY_CELL,
        isModificationPair: false,
      });
    }
    for (let k = pairs; k < added.length; k++) {
      out.push({
        left: EMPTY_CELL,
        right: cellFrom(added[k].line, added[k].idx, 'right'),
        isModificationPair: false,
      });
    }
  }

  return out;
}

// ── Word-level diff ──────────────────────────────────────────────

export type WordSpanKind = 'unchanged' | 'changed';

export interface WordSpan {
  text: string;
  kind: WordSpanKind;
}

export interface WordDiffPair {
  left: WordSpan[];
  right: WordSpan[];
}

/**
 * Compute word-level diff between two strings (the `-` and `+` halves
 * of a modification pair). Removed words become `changed` on the left
 * side, added words become `changed` on the right, unchanged words
 * appear on both sides as `unchanged`.
 *
 * Render uses CSS classes (`.word-changed-removed` / `.word-changed-added`
 * / `.word-unchanged`) so the same string can be styled differently per
 * side without re-parsing.
 */
export function wordDiffPair(oldText: string, newText: string): WordDiffPair {
  const changes = diffWords(oldText, newText);
  const left: WordSpan[] = [];
  const right: WordSpan[] = [];
  for (const change of changes) {
    if (change.added) {
      right.push({ text: change.value, kind: 'changed' });
    } else if (change.removed) {
      left.push({ text: change.value, kind: 'changed' });
    } else {
      left.push({ text: change.value, kind: 'unchanged' });
      right.push({ text: change.value, kind: 'unchanged' });
    }
  }
  return { left, right };
}

// Re-export DiffLineType so test files don't have to reach into types.ts.
export type { DiffLineType };
