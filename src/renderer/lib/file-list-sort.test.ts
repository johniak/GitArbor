import { describe, it, expect } from 'vitest';
import {
  basename,
  buildFileTree,
  collectDirPaths,
  filterFiles,
  flattenTree,
  sortFiles,
} from './file-list-sort';
import type { ChangedFile, FileStatus } from '../types';

const F = (path: string, status: FileStatus = 'M'): ChangedFile => ({
  path,
  status,
});

describe('basename', () => {
  it('returns last path segment', () => {
    expect(basename('a/b/c.ts')).toBe('c.ts');
    expect(basename('a.ts')).toBe('a.ts');
    expect(basename('')).toBe('');
  });
});

describe('filterFiles', () => {
  const files = [
    F('a.ts', 'M'),
    F('b.ts', 'A'),
    F('c.ts', 'U'),
    F('d.ts', '?'),
    F('e.ts', 'D'),
  ];

  it('pending returns all changed files', () => {
    expect(filterFiles(files, 'pending')).toEqual(files);
  });

  it('conflicts returns only U', () => {
    expect(filterFiles(files, 'conflicts').map((f) => f.path)).toEqual([
      'c.ts',
    ]);
  });

  it('untracked returns only ?', () => {
    expect(filterFiles(files, 'untracked').map((f) => f.path)).toEqual([
      'd.ts',
    ]);
  });

  it('modified returns only M', () => {
    expect(filterFiles(files, 'modified').map((f) => f.path)).toEqual(['a.ts']);
  });
});

describe('sortFiles', () => {
  const files = [F('z/c.ts'), F('a/b.ts'), F('m/a.ts')];

  it('path-asc orders by full path ascending', () => {
    expect(sortFiles(files, 'path-asc').map((f) => f.path)).toEqual([
      'a/b.ts',
      'm/a.ts',
      'z/c.ts',
    ]);
  });

  it('path-desc reverses path-asc', () => {
    expect(sortFiles(files, 'path-desc').map((f) => f.path)).toEqual([
      'z/c.ts',
      'm/a.ts',
      'a/b.ts',
    ]);
  });

  it('name-asc orders by basename', () => {
    expect(sortFiles(files, 'name-asc').map((f) => f.path)).toEqual([
      'm/a.ts',
      'a/b.ts',
      'z/c.ts',
    ]);
  });

  it('name-desc reverses name-asc', () => {
    expect(sortFiles(files, 'name-desc').map((f) => f.path)).toEqual([
      'z/c.ts',
      'a/b.ts',
      'm/a.ts',
    ]);
  });

  it('status orders U > ? > A > M > R > C > D', () => {
    const mixed = [
      F('m.ts', 'M'),
      F('u.ts', 'U'),
      F('q.ts', '?'),
      F('a.ts', 'A'),
      F('d.ts', 'D'),
    ];
    expect(sortFiles(mixed, 'status').map((f) => f.path)).toEqual([
      'u.ts',
      'q.ts',
      'a.ts',
      'm.ts',
      'd.ts',
    ]);
  });

  it('status falls back to path within group', () => {
    const mixed = [F('z.ts', 'M'), F('a.ts', 'M'), F('b.ts', 'M')];
    expect(sortFiles(mixed, 'status').map((f) => f.path)).toEqual([
      'a.ts',
      'b.ts',
      'z.ts',
    ]);
  });

  it('checked puts staged paths first', () => {
    const staged = new Set(['a/b.ts', 'm/a.ts']);
    expect(sortFiles(files, 'checked', staged).map((f) => f.path)).toEqual([
      'a/b.ts',
      'm/a.ts',
      'z/c.ts',
    ]);
  });

  it('does not mutate input', () => {
    const orig = [F('c.ts'), F('a.ts'), F('b.ts')];
    const snapshot = orig.map((f) => f.path);
    sortFiles(orig, 'path-asc');
    expect(orig.map((f) => f.path)).toEqual(snapshot);
  });
});

describe('buildFileTree', () => {
  it('builds nested directories with dirs before files', () => {
    const tree = buildFileTree(
      [F('src/a.ts'), F('src/b/c.ts'), F('z.ts')],
      'path-asc',
    );
    expect(tree.map((n) => n.name)).toEqual(['src', 'z.ts']);
    if (tree[0].kind !== 'dir') throw new Error('expected dir');
    expect(tree[0].children.map((c) => c.name)).toEqual(['b', 'a.ts']);
  });

  it('compacts single-child directory chains JetBrains-style', () => {
    const tree = buildFileTree([F('a/b/c/file.ts')], 'path-asc');
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('a/b/c');
    if (tree[0].kind !== 'dir') throw new Error('expected dir');
    expect(tree[0].children.map((c) => c.name)).toEqual(['file.ts']);
  });

  it('does not compact when a dir has its own files', () => {
    const tree = buildFileTree([F('a/x.ts'), F('a/b/y.ts')], 'path-asc');
    expect(tree[0].name).toBe('a');
    if (tree[0].kind !== 'dir') throw new Error('expected dir');
    expect(tree[0].children.map((c) => c.name)).toEqual(['b', 'x.ts']);
  });

  it('reverses dir order for descending sort modes', () => {
    const tree = buildFileTree(
      [F('a/x.ts'), F('b/y.ts'), F('c/z.ts')],
      'path-desc',
    );
    expect(tree.map((n) => n.name)).toEqual(['c', 'b', 'a']);
  });

  it('sorts files within a directory by mode', () => {
    const tree = buildFileTree(
      [F('src/z.ts'), F('src/a.ts'), F('src/m.ts')],
      'path-desc',
    );
    if (tree[0].kind !== 'dir') throw new Error('expected dir');
    expect(tree[0].children.map((c) => c.name)).toEqual([
      'z.ts',
      'm.ts',
      'a.ts',
    ]);
  });

  it('handles flat (no-directory) files', () => {
    const tree = buildFileTree([F('b.ts'), F('a.ts')], 'path-asc');
    expect(tree.map((n) => n.name)).toEqual(['a.ts', 'b.ts']);
    expect(tree.every((n) => n.kind === 'file')).toBe(true);
  });
});

describe('flattenTree', () => {
  const tree = buildFileTree(
    [F('src/a.ts'), F('src/b/c.ts'), F('src/b/d.ts'), F('z.ts')],
    'path-asc',
  );

  it('omits children of collapsed dirs', () => {
    const rows = flattenTree(tree, new Set());
    // 'src' collapsed, 'z.ts' visible
    expect(rows.map((r) => (r.kind === 'dir' ? r.name : r.file.path))).toEqual([
      'src',
      'z.ts',
    ]);
  });

  it('expands dirs marked in the set', () => {
    const rows = flattenTree(tree, new Set(['src']));
    // 'src' expanded shows: 'b' (collapsed) + 'a.ts'; 'z.ts' last
    expect(rows.map((r) => (r.kind === 'dir' ? r.name : r.file.path))).toEqual([
      'src',
      'b',
      'src/a.ts',
      'z.ts',
    ]);
  });

  it('expands nested dirs and reports correct depth', () => {
    const rows = flattenTree(tree, new Set(['src', 'src/b']));
    expect(
      rows.map((r) => ({
        n: r.kind === 'dir' ? r.name : r.file.path,
        d: r.depth,
      })),
    ).toEqual([
      { n: 'src', d: 0 },
      { n: 'b', d: 1 },
      { n: 'src/b/c.ts', d: 2 },
      { n: 'src/b/d.ts', d: 2 },
      { n: 'src/a.ts', d: 1 },
      { n: 'z.ts', d: 0 },
    ]);
  });
});

describe('collectDirPaths', () => {
  it('returns every directory path in the tree', () => {
    const tree = buildFileTree(
      [F('src/a.ts'), F('src/b/c.ts'), F('z.ts')],
      'path-asc',
    );
    expect(collectDirPaths(tree).sort()).toEqual(['src', 'src/b']);
  });
});
