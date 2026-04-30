import { describe, it, expect } from 'vitest';
import { truncateDiffsForCommitMessage, type DiffInput } from './diff-truncate';
import type { DiffHunk, DiffLine, FileDiff } from '../renderer/types';

function line(
  type: DiffLine['type'],
  content: string,
  newLine: number | null,
  oldLine: number | null,
): DiffLine {
  return { type, content, newLine, oldLine };
}

function hunk(header: string, lines: DiffLine[]): DiffHunk {
  return { header, lines };
}

function diff(opts: Partial<FileDiff> & { path: string }): FileDiff {
  return {
    path: opts.path,
    status: opts.status ?? 'M',
    binary: opts.binary ?? false,
    hunks: opts.hunks ?? [],
    from: opts.from,
  };
}

function input(path: string, d: FileDiff): DiffInput {
  return { path, diff: d };
}

describe('truncateDiffsForCommitMessage', () => {
  it('renders a small modification cleanly', () => {
    const d = diff({
      path: 'src/foo.ts',
      hunks: [
        hunk('@@ -1,2 +1,2 @@', [
          line('removed', 'old', null, 1),
          line('added', 'new', 1, null),
        ]),
      ],
    });
    const r = truncateDiffsForCommitMessage([input('src/foo.ts', d)]);
    expect(r.truncatedDiff).toContain('diff --git a/src/foo.ts');
    expect(r.truncatedDiff).toContain('-old');
    expect(r.truncatedDiff).toContain('+new');
    expect(r.meta.filesIncluded).toBe(1);
    expect(r.meta.filesOmitted).toBe(0);
  });

  it('collapses binary / lockfile / build files to a one-line summary', () => {
    const png = diff({ path: 'assets/logo.png' });
    const lock = diff({
      path: 'bun.lock',
      hunks: [hunk('@@', [line('added', 'noise', 1, null)])],
    });
    const dist = diff({
      path: 'dist/bundle.js',
      hunks: [hunk('@@', [line('added', 'minified', 1, null)])],
    });
    const r = truncateDiffsForCommitMessage([
      input('assets/logo.png', png),
      input('bun.lock', lock),
      input('dist/bundle.js', dist),
    ]);
    expect(r.truncatedDiff).toContain('<skipped>: assets/logo.png');
    expect(r.truncatedDiff).toContain('<skipped>: bun.lock');
    expect(r.truncatedDiff).toContain('<skipped>: dist/bundle.js');
  });

  it('marks `binary: true` (without a binary extension) as <binary>', () => {
    const bin = diff({ path: 'src/data.bin', binary: true });
    const r = truncateDiffsForCommitMessage([input('src/data.bin', bin)]);
    expect(r.truncatedDiff).toContain('<binary>: src/data.bin');
  });

  it('caps very large hunks with head/tail elision', () => {
    const lines: DiffLine[] = [];
    for (let i = 0; i < 500; i++) {
      lines.push(line('added', `line ${i}`, i, null));
    }
    const d = diff({
      path: 'src/big.ts',
      hunks: [hunk('@@ -0,0 +1,500 @@', lines)],
    });
    const r = truncateDiffsForCommitMessage([input('src/big.ts', d)]);
    expect(r.truncatedDiff).toContain('lines omitted');
    expect(r.meta.bytesAfter).toBeLessThan(r.meta.bytesOriginal);
  });

  it('omits trailing files once total byte budget is reached', () => {
    const giantHunk = hunk(
      '@@',
      Array.from({ length: 200 }, (_, i) =>
        line('added', `x${i}`.padEnd(60, '-'), i, null),
      ),
    );
    const files: DiffInput[] = [];
    for (let i = 0; i < 12; i++) {
      files.push(
        input(
          `src/file${i}.ts`,
          diff({ path: `src/file${i}.ts`, hunks: [giantHunk] }),
        ),
      );
    }
    const r = truncateDiffsForCommitMessage(files);
    expect(r.meta.filesOmitted).toBeGreaterThan(0);
    expect(r.meta.filesIncluded + r.meta.filesOmitted).toBe(12);
    expect(r.meta.bytesAfter).toBeLessThanOrEqual(20 * 1024);
  });

  it('orders deletions and modifications before additions', () => {
    const m = diff({
      path: 'src/m.ts',
      status: 'M',
      hunks: [hunk('@@', [line('added', 'mod', 1, null)])],
    });
    const a = diff({
      path: 'src/a.ts',
      status: 'A',
      hunks: [hunk('@@', [line('added', 'add', 1, null)])],
    });
    const d = diff({
      path: 'src/d.ts',
      status: 'D',
      hunks: [hunk('@@', [line('removed', 'del', null, 1)])],
    });
    const r = truncateDiffsForCommitMessage([
      input('src/a.ts', a),
      input('src/m.ts', m),
      input('src/d.ts', d),
    ]);
    const idxD = r.truncatedDiff.indexOf('src/d.ts');
    const idxM = r.truncatedDiff.indexOf('src/m.ts');
    const idxA = r.truncatedDiff.indexOf('src/a.ts');
    expect(idxD).toBeLessThan(idxM);
    expect(idxM).toBeLessThan(idxA);
  });
});
