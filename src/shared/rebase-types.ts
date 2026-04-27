/**
 * Types shared between main and renderer for interactive rebase.
 *
 * UI ordering convention: `RebasePlan.steps` is **newest-first** (top of the
 * dialog list = HEAD). The main process reverses to oldest-first before
 * writing the git-rebase-todo file.
 */

export type RebaseAction = 'pick' | 'drop' | 'reword' | 'edit' | 'squash';

export interface RebaseStep {
  /** Full commit hash. */
  hash: string;
  hashShort: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  /** ISO 8601 date string. */
  date: string;
  /** Parent commit hashes (for the commit-info panel). */
  parents: string[];
  /** Ref decorations (HEAD, branches, tags) — split from `git log %D`. */
  refs: string[];
  action: RebaseAction;
  /**
   * For `reword`: the new subject (and body if multi-line).
   * For `squash`: the combined message that replaces the squash target's
   * message after the squash completes.
   */
  newMessage?: string;
}

export interface RebasePlan {
  /** Commit referenced as `<base>` in `git rebase -i <base>`. */
  baseHash: string;
  /** Steps in newest-first UI order. */
  steps: RebaseStep[];
}

export interface RunInteractiveRebaseResult {
  conflicts: string[];
  summary: string;
  error?: string;
}
