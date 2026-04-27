import type { ChangedFile, FileStatus } from '../types';

export type FileViewMode = 'flat-single' | 'flat-multi' | 'tree';
export type FileSortMode =
  | 'path-asc'
  | 'path-desc'
  | 'name-asc'
  | 'name-desc'
  | 'status'
  | 'checked';
export type FileStatusFilter =
  | 'pending'
  | 'conflicts'
  | 'untracked'
  | 'modified';
export type StagingMode = 'split' | 'fluid' | 'none';

export const STATUS_SORT_ORDER: Record<FileStatus, number> = {
  U: 0,
  '?': 1,
  A: 2,
  M: 3,
  R: 4,
  C: 5,
  D: 6,
};

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

export function filterFiles(
  files: ChangedFile[],
  filter: FileStatusFilter,
): ChangedFile[] {
  switch (filter) {
    case 'pending':
      return files;
    case 'conflicts':
      return files.filter((f) => f.status === 'U');
    case 'untracked':
      return files.filter((f) => f.status === '?');
    case 'modified':
      return files.filter((f) => f.status === 'M');
  }
}

export function sortFiles(
  files: ChangedFile[],
  mode: FileSortMode,
  stagedPaths?: ReadonlySet<string>,
): ChangedFile[] {
  const arr = [...files];
  switch (mode) {
    case 'path-asc':
      arr.sort((a, b) => a.path.localeCompare(b.path));
      break;
    case 'path-desc':
      arr.sort((a, b) => b.path.localeCompare(a.path));
      break;
    case 'name-asc':
      arr.sort((a, b) => {
        const c = basename(a.path).localeCompare(basename(b.path));
        return c !== 0 ? c : a.path.localeCompare(b.path);
      });
      break;
    case 'name-desc':
      arr.sort((a, b) => {
        const c = basename(b.path).localeCompare(basename(a.path));
        return c !== 0 ? c : b.path.localeCompare(a.path);
      });
      break;
    case 'status':
      arr.sort((a, b) => {
        const c = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
        return c !== 0 ? c : a.path.localeCompare(b.path);
      });
      break;
    case 'checked':
      arr.sort((a, b) => {
        const sa = stagedPaths?.has(a.path) ? 0 : 1;
        const sb = stagedPaths?.has(b.path) ? 0 : 1;
        return sa !== sb ? sa - sb : a.path.localeCompare(b.path);
      });
      break;
  }
  return arr;
}

export type FileTreeNode =
  | { kind: 'dir'; name: string; path: string; children: FileTreeNode[] }
  | { kind: 'file'; name: string; path: string; file: ChangedFile };

type DirAcc = { children: Map<string, DirAcc>; files: ChangedFile[] };

export function buildFileTree(
  files: ChangedFile[],
  sortMode: FileSortMode,
): FileTreeNode[] {
  const root: DirAcc = { children: new Map(), files: [] };
  for (const f of files) {
    const segs = f.path.split('/');
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i];
      let next = cur.children.get(seg);
      if (!next) {
        next = { children: new Map(), files: [] };
        cur.children.set(seg, next);
      }
      cur = next;
    }
    cur.files.push(f);
  }

  const dirReverse = sortMode === 'path-desc' || sortMode === 'name-desc';
  const dirCmp = (a: FileTreeNode, b: FileTreeNode) =>
    dirReverse ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);

  function build(acc: DirAcc, prefix: string): FileTreeNode[] {
    const dirNodes: FileTreeNode[] = [];
    for (const [name, child] of acc.children) {
      let displayName = name;
      let displayPath = prefix ? `${prefix}/${name}` : name;
      let collapsed = child;
      while (collapsed.files.length === 0 && collapsed.children.size === 1) {
        const [onlyName, onlyChild] = [...collapsed.children][0];
        displayName = `${displayName}/${onlyName}`;
        displayPath = `${displayPath}/${onlyName}`;
        collapsed = onlyChild;
      }
      dirNodes.push({
        kind: 'dir',
        name: displayName,
        path: displayPath,
        children: build(collapsed, displayPath),
      });
    }
    dirNodes.sort(dirCmp);

    const fileNodes: FileTreeNode[] = sortFiles(acc.files, sortMode).map(
      (f) => ({
        kind: 'file' as const,
        name: basename(f.path),
        path: f.path,
        file: f,
      }),
    );

    return [...dirNodes, ...fileNodes];
  }

  return build(root, '');
}

export type FlatTreeRow =
  | {
      kind: 'dir';
      name: string;
      path: string;
      depth: number;
      collapsed: boolean;
    }
  | { kind: 'file'; file: ChangedFile; depth: number };

export function flattenTree(
  nodes: FileTreeNode[],
  expandedDirs: ReadonlySet<string>,
  depth = 0,
): FlatTreeRow[] {
  const out: FlatTreeRow[] = [];
  for (const node of nodes) {
    if (node.kind === 'dir') {
      const collapsed = !expandedDirs.has(node.path);
      out.push({
        kind: 'dir',
        name: node.name,
        path: node.path,
        depth,
        collapsed,
      });
      if (!collapsed) {
        out.push(...flattenTree(node.children, expandedDirs, depth + 1));
      }
    } else {
      out.push({ kind: 'file', file: node.file, depth });
    }
  }
  return out;
}

/** All directory paths in a tree — used to "expand all" in tree view. */
export function collectDirPaths(nodes: FileTreeNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'dir') {
      out.push(node.path);
      out.push(...collectDirPaths(node.children));
    }
  }
  return out;
}
