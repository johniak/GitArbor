/**
 * Reactive store for git worktree state.
 *
 * - `worktrees`: full list returned by `git worktree list --porcelain`
 *   (refreshed on hydrate, after add/remove/lock/unlock, and on
 *   `REPO_CHANGED`).
 * - `openTabPaths`: in-memory list of worktree paths currently open as
 *   tabs in the main window. The first entry is always the main worktree.
 *   Persistence across sessions is intentionally out of scope for v1.
 * - `dirty`: per-tab dirty status, refreshed on `REPO_CHANGED` and on
 *   window focus. Sidebar entries don't show dirty (avoids N git status
 *   invocations).
 *
 * The store does NOT subscribe to IPC events itself — App.svelte calls
 * `refresh()` at the right moments. This keeps the store simple and
 * avoids double-subscription if multiple places hydrate.
 */

import type { Worktree } from '../shared/ipc';

class WorktreesStore {
  worktrees = $state<Worktree[]>([]);
  /** Paths of worktrees currently open as tabs. Always includes the
   *  main worktree as element 0. */
  openTabPaths = $state<string[]>([]);
  /** Map of worktree path → has-uncommitted-changes. Only populated for
   *  paths in `openTabPaths` (v1 simplification). */
  dirty = $state<Record<string, boolean>>({});

  /** All worktrees that are currently open as tabs, in tab order. */
  openTabs = $derived(
    this.openTabPaths
      .map((p) => this.worktrees.find((w) => w.path === p))
      .filter((w): w is Worktree => w !== undefined)
      .map((w) => ({ ...w, dirty: this.dirty[w.path] ?? false })),
  );

  /** The main worktree, or null while we haven't loaded yet. */
  mainWorktree = $derived(this.worktrees.find((w) => w.isMain) ?? null);

  /** Refresh the worktree list. Also reconciles `openTabPaths`: any
   *  paths that no longer exist on disk (worktree removed externally
   *  or via remove flow) drop out, and the main path is always present. */
  async refreshList(): Promise<void> {
    try {
      const list = await window.electronAPI.git.getWorktrees();
      this.worktrees = list;
      const validPaths = new Set(list.map((w) => w.path));
      const main = list.find((w) => w.isMain)?.path;
      const next = this.openTabPaths.filter((p) => validPaths.has(p));
      if (main && !next.includes(main)) next.unshift(main);
      this.openTabPaths = next;
    } catch (e) {
      console.error('[worktrees] refreshList failed:', e);
    }
  }

  /** Refresh dirty status for currently-open tabs. Single batched IPC. */
  async refreshDirty(): Promise<void> {
    const paths = this.openTabPaths;
    if (paths.length === 0) return;
    try {
      this.dirty = await window.electronAPI.git.getWorktreeDirtyStatus(paths);
    } catch (e) {
      console.error('[worktrees] refreshDirty failed:', e);
    }
  }

  /** Open a worktree as a tab (push to openTabPaths if absent), or just
   *  switch to it if already open. Caller is responsible for then
   *  triggering the actual repo switch via `repo.openEphemeral()`. */
  ensureTab(worktreePath: string): void {
    if (this.openTabPaths.includes(worktreePath)) return;
    this.openTabPaths = [...this.openTabPaths, worktreePath];
  }

  /** Soft-close a tab: removes from `openTabPaths` but leaves the
   *  worktree on disk and in `worktrees`. The main tab is sticky. */
  closeTab(worktreePath: string): void {
    const main = this.mainWorktree?.path;
    if (worktreePath === main) return; // main tab can't be closed
    this.openTabPaths = this.openTabPaths.filter((p) => p !== worktreePath);
  }

  /** Drop a worktree from both the list and tabs (after a hard remove). */
  forget(worktreePath: string): void {
    this.openTabPaths = this.openTabPaths.filter((p) => p !== worktreePath);
    this.worktrees = this.worktrees.filter((w) => w.path !== worktreePath);
    if (this.dirty[worktreePath]) {
      const next = { ...this.dirty };
      delete next[worktreePath];
      this.dirty = next;
    }
  }
}

export const worktreesStore = new WorktreesStore();
