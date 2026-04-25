/**
 * Application data types for GitArbor.
 *
 * These types represent UI-ready data derived from git.
 * They map closely to simple-git output but are decoupled from it
 * so components don't depend on the git library directly.
 */

// ── Branches & Refs ──────────────────────────────────────────

export interface Branch {
  name: string;
  current: boolean;
  /** Short commit hash this branch points to */
  commit: string;
  /** Remote tracking branch, e.g. "origin/main" */
  tracking: string | null;
  /** Commits ahead of tracking branch */
  ahead: number;
  /** Commits behind tracking branch */
  behind: number;
}

export interface Tag {
  name: string;
}

export interface Remote {
  name: string;
  /** Branches on this remote */
  branches: string[];
  /** Push URL, e.g. git@github.com:org/repo.git — undefined if not resolvable */
  url?: string;
}

export interface Stash {
  index: number;
  message: string;
  date: string;
}

// ── Sidebar ──────────────────────────────────────────────────

export interface SidebarData {
  branches: Branch[];
  tags: Tag[];
  remotes: Remote[];
  stashes: Stash[];
}

export type SidebarView = 'file-status' | 'history' | 'search';

// ── Commit Log ───────────────────────────────────────────────

export interface Commit {
  /** Full SHA hash */
  hash: string;
  /** Short hash for display */
  hashShort: string;
  message: string;
  authorName: string;
  authorEmail: string;
  /** ISO date string */
  date: string;
  /** Relative date for display, e.g. "2 hours ago" */
  dateRelative: string;
  /** Parent commit hashes (for graph rendering) */
  parents: string[];
  /** Refs pointing at this commit (branch names, tags) */
  refs: string[];
}

// ── Commit Graph ─────────────────────────────────────────────

/** A single segment drawn in one row of the graph */
export type GraphSegment =
  | { type: 'pipe'; lane: number; color: string } // vertical line passing through
  | { type: 'dot'; lane: number; color: string } // commit dot
  | { type: 'merge-left'; fromLane: number; toLane: number; color: string } // line curving left (down)
  | { type: 'merge-right'; fromLane: number; toLane: number; color: string } // line curving right (down)
  | { type: 'fork'; fromLane: number; toLane: number; color: string } // branch forking out (down)
  | { type: 'converge'; fromLane: number; toLane: number; color: string }; // branch joining from above (curve up)

/** Rendering instructions for one row in the graph */
export interface GraphRow {
  segments: GraphSegment[];
  /** How many lanes are active at this row (determines column width) */
  laneCount: number;
  /** Which lane holds the commit dot */
  commitLane: number;
  /** Color of this commit's dot */
  commitColor: string;
  /** True if this commit's lane ends here (root commit, no parents) */
  laneEndsHere: boolean;
  /** True if this commit starts a new lane (branch tip, no child above) */
  isNewLane: boolean;
}

/** Saved lane state for incremental/paginated graph computation */
export interface GraphState {
  lanes: (GraphLane | null)[];
}

export interface GraphLane {
  /** Commit hash this lane is waiting for */
  hash: string;
  color: string;
}

// ── File Status ──────────────────────────────────────────────

/** Git file status codes */
export type FileStatus =
  | 'A' // Added
  | 'M' // Modified
  | 'D' // Deleted
  | 'R' // Renamed
  | 'C' // Copied
  | 'U' // Unmerged / conflicted
  | '?'; // Untracked

export interface ChangedFile {
  path: string;
  status: FileStatus;
  /** Original path when renamed */
  from?: string;
  /** Number of insertions (if available from diff stat) */
  insertions?: number;
  /** Number of deletions (if available from diff stat) */
  deletions?: number;
}

// ── Diff ─────────────────────────────────────────────────────

export type DiffLineType = 'added' | 'removed' | 'context';

export interface DiffLine {
  /** Line number in the new file (null for removed lines) */
  newLine: number | null;
  /** Line number in the old file (null for added lines) */
  oldLine: number | null;
  type: DiffLineType;
  content: string;
}

export interface DiffHunk {
  /** e.g. "@@ -1,5 +1,7 @@" */
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  /** Original path when renamed */
  from?: string;
  status: FileStatus;
  hunks: DiffHunk[];
  /** Binary file — no line-by-line diff */
  binary: boolean;
}

// ── Working Changes ──────────────────────────────────────────

export interface WorkingStatus {
  staged: ChangedFile[];
  unstaged: ChangedFile[];
  hasChanges: boolean;
}

// ── Toolbar Actions ──────────────────────────────────────────

export type ToolbarAction =
  | 'commit'
  | 'pull'
  | 'push'
  | 'fetch'
  | 'branch'
  | 'merge'
  | 'stash'
  | 'show-in-folder'
  | 'terminal'
  | 'remote'
  | 'settings';
