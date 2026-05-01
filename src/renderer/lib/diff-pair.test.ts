import { describe, it, expect } from 'vitest';
import { pairLinesForSplit, wordDiffPair } from './diff-pair';
import type { DiffHunk, DiffLine } from '../types';

function ctx(content: string, oldLine: number, newLine: number): DiffLine {
  return { type: 'context', content, oldLine, newLine };
}
function del(content: string, oldLine: number): DiffLine {
  return { type: 'removed', content, oldLine, newLine: null };
}
function add(content: string, newLine: number): DiffLine {
  return { type: 'added', content, oldLine: null, newLine };
}
function hunk(...lines: DiffLine[]): DiffHunk {
  return { header: '@@ -1,1 +1,1 @@', lines };
}

describe('pairLinesForSplit', () => {
  it('mirrors context lines on both sides', () => {
    const r = pairLinesForSplit(hunk(ctx('a', 1, 1), ctx('b', 2, 2)));
    expect(r).toHaveLength(2);
    expect(r[0].left.content).toBe('a');
    expect(r[0].right.content).toBe('a');
    expect(r[0].left.lineNum).toBe(1);
    expect(r[0].right.lineNum).toBe(1);
    expect(r[0].isModificationPair).toBe(false);
  });

  it('pairs equal-size removed/added runs as modification pairs', () => {
    const r = pairLinesForSplit(
      hunk(del('a', 1), del('b', 2), add('A', 1), add('B', 2)),
    );
    expect(r).toHaveLength(2);
    expect(r[0].left.content).toBe('a');
    expect(r[0].right.content).toBe('A');
    expect(r[0].isModificationPair).toBe(true);
    expect(r[1].left.content).toBe('b');
    expect(r[1].right.content).toBe('B');
    expect(r[1].isModificationPair).toBe(true);
  });

  it('handles unequal runs: more removals than additions', () => {
    const r = pairLinesForSplit(
      hunk(del('a', 1), del('b', 2), del('c', 3), add('A', 1), add('B', 2)),
    );
    expect(r).toHaveLength(3);
    expect(r[0].isModificationPair).toBe(true);
    expect(r[1].isModificationPair).toBe(true);
    expect(r[2].left.content).toBe('c');
    expect(r[2].right.kind).toBe('empty');
    expect(r[2].right.lineNum).toBeNull();
    expect(r[2].isModificationPair).toBe(false);
  });

  it('handles unequal runs: more additions than removals', () => {
    const r = pairLinesForSplit(
      hunk(del('a', 1), add('A', 1), add('B', 2), add('C', 3)),
    );
    expect(r).toHaveLength(3);
    expect(r[0].isModificationPair).toBe(true);
    expect(r[1].left.kind).toBe('empty');
    expect(r[1].right.content).toBe('B');
    expect(r[2].left.kind).toBe('empty');
    expect(r[2].right.content).toBe('C');
  });

  it('renders pure deletions with empty right side', () => {
    const r = pairLinesForSplit(hunk(del('a', 1), del('b', 2)));
    expect(r).toHaveLength(2);
    expect(r[0].left.content).toBe('a');
    expect(r[0].right.kind).toBe('empty');
    expect(r[1].left.content).toBe('b');
    expect(r[1].right.kind).toBe('empty');
  });

  it('renders pure additions with empty left side', () => {
    const r = pairLinesForSplit(hunk(add('A', 1), add('B', 2)));
    expect(r).toHaveLength(2);
    expect(r[0].left.kind).toBe('empty');
    expect(r[0].right.content).toBe('A');
    expect(r[1].left.kind).toBe('empty');
    expect(r[1].right.content).toBe('B');
  });

  it('weaves context with mod-pairs and standalone runs', () => {
    const r = pairLinesForSplit(
      hunk(
        ctx('keep1', 1, 1),
        del('old', 2),
        add('new', 2),
        ctx('keep2', 3, 3),
        add('extra', 4),
      ),
    );
    expect(r).toHaveLength(4);
    expect(r[0].isModificationPair).toBe(false);
    expect(r[1].isModificationPair).toBe(true);
    expect(r[2].isModificationPair).toBe(false);
    expect(r[3].isModificationPair).toBe(false);
    expect(r[3].left.kind).toBe('empty');
    expect(r[3].right.content).toBe('extra');
  });

  it('returns empty for empty hunk', () => {
    expect(pairLinesForSplit(hunk())).toEqual([]);
  });

  it('preserves originalIndex for click-correlation', () => {
    const r = pairLinesForSplit(hunk(ctx('a', 1, 1), del('b', 2), add('B', 2)));
    expect(r[0].left.originalIndex).toBe(0);
    expect(r[1].left.originalIndex).toBe(1);
    expect(r[1].right.originalIndex).toBe(2);
  });
});

describe('wordDiffPair', () => {
  it('marks unchanged words on both sides', () => {
    const r = wordDiffPair('foo bar', 'foo bar');
    expect(r.left.every((s) => s.kind === 'unchanged')).toBe(true);
    expect(r.right.every((s) => s.kind === 'unchanged')).toBe(true);
    expect(r.left.map((s) => s.text).join('')).toBe('foo bar');
    expect(r.right.map((s) => s.text).join('')).toBe('foo bar');
  });

  it('marks one changed word per side', () => {
    const r = wordDiffPair('foo bar baz', 'foo BAR baz');
    expect(r.left.find((s) => s.kind === 'changed')?.text).toBe('bar');
    expect(r.right.find((s) => s.kind === 'changed')?.text).toBe('BAR');
    expect(r.left.map((s) => s.text).join('')).toBe('foo bar baz');
    expect(r.right.map((s) => s.text).join('')).toBe('foo BAR baz');
  });

  it('handles totally different strings — all changed', () => {
    const r = wordDiffPair('alpha', 'omega');
    expect(r.left).toEqual([{ text: 'alpha', kind: 'changed' }]);
    expect(r.right).toEqual([{ text: 'omega', kind: 'changed' }]);
  });

  it('handles addition at end', () => {
    const r = wordDiffPair('foo', 'foo bar');
    expect(r.left.every((s) => s.kind === 'unchanged')).toBe(true);
    const changed = r.right.filter((s) => s.kind === 'changed');
    expect(changed.length).toBeGreaterThan(0);
    expect(r.right.map((s) => s.text).join('')).toBe('foo bar');
  });

  it('handles removal at end', () => {
    const r = wordDiffPair('foo bar', 'foo');
    expect(r.right.every((s) => s.kind === 'unchanged')).toBe(true);
    const changed = r.left.filter((s) => s.kind === 'changed');
    expect(changed.length).toBeGreaterThan(0);
  });
});
