<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import Splitter from './Splitter.svelte';
  import {
    Pencil,
    Plus,
    Minus,
    ArrowRight,
    Copy,
    AlertTriangle,
    CirclePlus,
  } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import type {
    ChangedFile,
    Commit,
    FileStatus,
    WorkingStatus,
  } from '../types';

  type Props = {
    files: ChangedFile[];
    workingStatus?: WorkingStatus | null;
    isWorkingChanges?: boolean;
    selectedPath?: string | null;
    selectedCommit?: Commit | null;
    commitBody?: string;
    onSelectFile?: (path: string, staged: boolean) => void;
    onStageFile?: (path: string, stage: boolean) => void;
    onSelectParent?: (hash: string) => void;
    onOpenFile?: (path: string) => void;
    onDiscardFile?: (path: string, status: FileStatus, staged: boolean) => void;
    onIgnoreFile?: (path: string) => void;
    onCreatePatch?: (path: string, staged: boolean) => void;
    onDiscardFiles?: (
      files: Array<{ path: string; status: FileStatus; staged: boolean }>,
    ) => void;
    onIgnoreFiles?: (paths: string[]) => void;
    onStageAll?: () => void;
    onUnstageAll?: () => void;
    onResolveConflict?: (path: string, strategy: 'mine' | 'theirs') => void;
    onMarkResolved?: (path: string) => void;
    onMarkUnresolved?: (path: string) => void;
  };

  let {
    files,
    workingStatus = null,
    isWorkingChanges = false,
    selectedPath = null,
    selectedCommit = null,
    commitBody = '',
    onSelectFile,
    onStageFile,
    onSelectParent,
    onOpenFile,
    onDiscardFile,
    onIgnoreFile,
    onCreatePatch,
    onDiscardFiles,
    onIgnoreFiles,
    onStageAll,
    onUnstageAll,
    onResolveConflict,
    onMarkResolved,
    onMarkUnresolved,
  }: Props = $props();

  let stagedExpanded = $state(true);
  let unstagedExpanded = $state(true);
  let commitInfoHeight = $state(200);

  // Multi-select state — keys are "path\0staged" to distinguish same file in both sections
  let selectedKeys = new SvelteSet<string>();
  let lastClickedKey = $state<string | null>(null);

  function selKey(path: string, staged: boolean): string {
    return `${path}\0${staged}`;
  }

  // Context menu — supports single or multi file
  let contextMenuPos = $state<{ x: number; y: number } | null>(null);
  let contextMenuFiles = $state<
    Array<{ path: string; status: FileStatus; staged: boolean }>
  >([]);

  // Flat ordered list of all working files for shift-click range
  let allWorkingFiles = $derived.by(() => {
    if (!workingStatus) return [];
    const files: Array<{
      path: string;
      status: FileStatus;
      staged: boolean;
      key: string;
    }> = [];
    for (const f of workingStatus.staged)
      files.push({
        path: f.path,
        status: f.status,
        staged: true,
        key: selKey(f.path, true),
      });
    for (const f of workingStatus.unstaged)
      files.push({
        path: f.path,
        status: f.status,
        staged: false,
        key: selKey(f.path, false),
      });
    return files;
  });

  function handleFileClick(
    e: MouseEvent,
    path: string,
    status: FileStatus,
    staged: boolean,
  ) {
    const key = selKey(path, staged);
    if (e.metaKey || e.ctrlKey) {
      if (selectedKeys.has(key)) selectedKeys.delete(key);
      else selectedKeys.add(key);
      lastClickedKey = key;
    } else if (e.shiftKey && lastClickedKey) {
      const keys = allWorkingFiles.map((f) => f.key);
      const from = keys.indexOf(lastClickedKey);
      const to = keys.indexOf(key);
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        for (let i = start; i <= end; i++) selectedKeys.add(keys[i]);
      }
    } else {
      selectedKeys.clear();
      selectedKeys.add(key);
      lastClickedKey = key;
      onSelectFile?.(path, staged);
    }
  }

  function openContextMenu(
    e: MouseEvent,
    path: string,
    status: FileStatus,
    staged: boolean,
  ) {
    if (!isWorkingChanges) return;
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 170);
    const y = Math.min(e.clientY, window.innerHeight - 150);

    const key = selKey(path, staged);
    if (selectedKeys.has(key) && selectedKeys.size > 1) {
      // Right-click on selected file in multi-selection
      contextMenuFiles = allWorkingFiles.filter((f) => selectedKeys.has(f.key));
    } else {
      // Right-click on unselected file or single selection
      selectedKeys.clear();
      selectedKeys.add(key);
      lastClickedKey = key;
      contextMenuFiles = [{ path, status, staged }];
    }
    contextMenuPos = { x, y };
  }

  function closeContextMenu() {
    contextMenuPos = null;
    contextMenuFiles = [];
  }

  async function handleCopyPath() {
    if (contextMenuFiles.length !== 1) return;
    await navigator.clipboard.writeText(contextMenuFiles[0].path);
    closeContextMenu();
  }

  function resizeCommitInfo(delta: number) {
    commitInfoHeight = Math.max(80, commitInfoHeight - delta);
  }

  function refColor(ref: string): string {
    if (ref.startsWith('HEAD')) return '#569cd6';
    if (ref.startsWith('tag:')) return '#dcdcaa';
    if (ref.startsWith('origin/')) return '#4ec9b0';
    return '#6a9955';
  }

  const statusIcon: Record<FileStatus, { icon: Component; color: string }> = {
    M: { icon: Pencil, color: '#e2a04f' },
    A: { icon: Plus, color: '#5cb85c' },
    D: { icon: Minus, color: '#d9534f' },
    R: { icon: ArrowRight, color: '#5bc0de' },
    C: { icon: Copy, color: '#5bc0de' },
    U: { icon: AlertTriangle, color: '#d9534f' },
    '?': { icon: CirclePlus, color: '#5cb85c' },
  };
</script>

<svelte:window
  onkeydown={(e) => {
    if (contextMenuPos && e.key === 'Escape') closeContextMenu();
  }}
  onclick={() => {
    if (contextMenuPos) closeContextMenu();
  }}
/>

<div class="file-list">
  {#if isWorkingChanges && workingStatus}
    <!-- Working changes: staged + unstaged sections -->
    <div class="file-header">Pending files, sorted by path</div>
    <div class="files">
      <!-- Staged -->
      <div class="section-header-row">
        <input
          type="checkbox"
          class="stage-all-checkbox"
          checked
          onclick={(e: MouseEvent) => {
            e.stopPropagation();
            onUnstageAll?.();
          }}
          title="Unstage all files"
        />
        <button
          class="section-toggle"
          onclick={() => (stagedExpanded = !stagedExpanded)}
        >
          <span class="expand-arrow">{stagedExpanded ? '▾' : '▸'}</span>
          Staged files
          <span class="file-count">{workingStatus.staged.length}</span>
        </button>
      </div>
      {#if stagedExpanded}
        {#each workingStatus.staged as file}
          <div
            class="file-row"
            class:selected={selectedKeys.has(selKey(file.path, true))}
            oncontextmenu={(e) =>
              openContextMenu(e, file.path, file.status, true)}
            onclick={(e) => handleFileClick(e, file.path, file.status, true)}
          >
            <input
              type="checkbox"
              class="stage-checkbox"
              checked
              onclick={(e: MouseEvent) => {
                e.stopPropagation();
                onStageFile?.(file.path, false);
              }}
            />
            <span class="file-status">
              <svelte:component
                this={statusIcon[file.status].icon}
                size={14}
                color={statusIcon[file.status].color}
              />
            </span>
            <span
              class="file-path"
              style="color:{selectedKeys.has(selKey(file.path, true))
                ? 'var(--color-text-white)'
                : 'var(--color-text-primary)'}">{file.path}</span
            >
          </div>
        {/each}
      {/if}

      <!-- Unstaged -->
      <div class="section-header-row">
        <input
          type="checkbox"
          class="stage-all-checkbox"
          onclick={(e: MouseEvent) => {
            e.stopPropagation();
            onStageAll?.();
          }}
          title="Stage all files"
        />
        <button
          class="section-toggle"
          onclick={() => (unstagedExpanded = !unstagedExpanded)}
        >
          <span class="expand-arrow">{unstagedExpanded ? '▾' : '▸'}</span>
          Unstaged files
          <span class="file-count">{workingStatus.unstaged.length}</span>
        </button>
      </div>
      {#if unstagedExpanded}
        {#each workingStatus.unstaged as file}
          <div
            class="file-row"
            class:selected={selectedKeys.has(selKey(file.path, false))}
            oncontextmenu={(e) =>
              openContextMenu(e, file.path, file.status, false)}
            onclick={(e) => handleFileClick(e, file.path, file.status, false)}
          >
            <input
              type="checkbox"
              class="stage-checkbox"
              onclick={(e: MouseEvent) => {
                e.stopPropagation();
                onStageFile?.(file.path, true);
              }}
            />
            <span class="file-status">
              <svelte:component
                this={statusIcon[file.status].icon}
                size={14}
                color={statusIcon[file.status].color}
              />
            </span>
            <span
              class="file-path"
              style="color:{selectedKeys.has(selKey(file.path, false))
                ? 'var(--color-text-white)'
                : 'var(--color-text-primary)'}">{file.path}</span
            >
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <!-- Normal commit: flat list -->
    <div class="file-header">Changed files — Sorted by path</div>
    <div class="files">
      {#each files as file}
        <button
          class="file-row"
          class:selected={selectedPath === file.path}
          onclick={() => onSelectFile?.(file.path, false)}
        >
          <span class="file-status">
            <svelte:component
              this={statusIcon[file.status].icon}
              size={14}
              color={statusIcon[file.status].color}
            />
          </span>
          <span
            class="file-path"
            style="color:{selectedPath === file.path
              ? 'var(--color-text-white)'
              : 'var(--color-text-primary)'}">{file.path}</span
          >
        </button>
      {/each}
    </div>
  {/if}

  {#if contextMenuPos && contextMenuFiles.length > 0}
    <div
      class="file-context-menu"
      style="left:{contextMenuPos.x}px;top:{contextMenuPos.y}px"
      onclick={(e) => e.stopPropagation()}
    >
      {#if contextMenuFiles.length === 1}
        {#if contextMenuFiles[0].status === 'U'}
          <div class="context-item-with-submenu">
            <button
              class="context-item context-item-trigger"
              type="button"
              data-testid="resolve-conflicts-trigger"
            >
              <span>Resolve Conflicts</span>
              <span class="submenu-arrow">›</span>
            </button>
            <div class="submenu">
              <button
                class="context-item"
                type="button"
                disabled
                title="Configure git merge.tool first"
                >Launch External Merge Tool</button
              >
              <button
                class="context-item"
                type="button"
                onclick={() => {
                  onResolveConflict?.(contextMenuFiles[0].path, 'mine');
                  closeContextMenu();
                }}
                data-testid="resolve-using-mine"
                >Resolve Using 'Mine' (keep the changes from your current
                branch)</button
              >
              <button
                class="context-item"
                type="button"
                onclick={() => {
                  onResolveConflict?.(contextMenuFiles[0].path, 'theirs');
                  closeContextMenu();
                }}
                data-testid="resolve-using-theirs"
                >Resolve Using 'Theirs' (accept the incoming changes)</button
              >
              <div class="context-separator"></div>
              <button class="context-item" type="button" disabled
                >Restart Merge</button
              >
              <button
                class="context-item"
                type="button"
                onclick={() => {
                  onMarkResolved?.(contextMenuFiles[0].path);
                  closeContextMenu();
                }}
                data-testid="mark-resolved">Mark Resolved</button
              >
              <button
                class="context-item"
                type="button"
                onclick={() => {
                  onMarkUnresolved?.(contextMenuFiles[0].path);
                  closeContextMenu();
                }}
                data-testid="mark-unresolved">Mark Unresolved</button
              >
            </div>
          </div>
          <div class="context-separator"></div>
        {/if}
        <button
          class="context-item"
          onclick={() => {
            onOpenFile?.(contextMenuFiles[0].path);
            closeContextMenu();
          }}>Open</button
        >
        <button class="context-item" onclick={handleCopyPath}>Copy Path</button>
        <button
          class="context-item"
          onclick={() => {
            onCreatePatch?.(
              contextMenuFiles[0].path,
              contextMenuFiles[0].staged,
            );
            closeContextMenu();
          }}>Create Patch</button
        >
        <button
          class="context-item"
          onclick={() => {
            onIgnoreFile?.(contextMenuFiles[0].path);
            closeContextMenu();
          }}>Ignore</button
        >
        <button
          class="context-item context-item-danger"
          onclick={() => {
            onDiscardFile?.(
              contextMenuFiles[0].path,
              contextMenuFiles[0].status,
              contextMenuFiles[0].staged,
            );
            closeContextMenu();
          }}>Discard</button
        >
      {:else}
        <button
          class="context-item"
          onclick={() => {
            onIgnoreFiles?.(contextMenuFiles.map((f) => f.path));
            closeContextMenu();
          }}>Ignore ({contextMenuFiles.length} files)</button
        >
        <button
          class="context-item context-item-danger"
          onclick={() => {
            onDiscardFiles?.(contextMenuFiles);
            closeContextMenu();
          }}>Discard ({contextMenuFiles.length} files)</button
        >
      {/if}
    </div>
  {/if}

  {#if selectedCommit && !isWorkingChanges}
    <Splitter direction="vertical" onResize={resizeCommitInfo} />
    <div class="commit-info" style="height:{commitInfoHeight}px">
      <div class="commit-info-header">
        <img
          class="avatar"
          src="https://ui-avatars.com/api/?name={encodeURIComponent(
            selectedCommit.authorName,
          )}&size=40&background=333&color=ccc&rounded=true"
          alt=""
        />
        <div class="commit-title">{selectedCommit.message}</div>
      </div>

      {#if commitBody}
        <pre class="commit-body">{commitBody}</pre>
      {/if}

      <div class="commit-meta">
        <div class="meta-row">
          <span class="meta-label">Commit:</span>
          <span class="meta-value mono"
            >{selectedCommit.hash} [{selectedCommit.hashShort}]</span
          >
        </div>
        {#if selectedCommit.parents.length > 0}
          <div class="meta-row">
            <span class="meta-label">Parents:</span>
            <span class="meta-value mono parent-links"
              >{#each selectedCommit.parents as parent, i}{#if i > 0},
                {/if}<button
                  class="parent-link"
                  onclick={() => onSelectParent?.(parent)}
                  >{parent.slice(0, 8)}</button
                >{/each}</span
            >
          </div>
        {/if}
        <div class="meta-row">
          <span class="meta-label">Author:</span>
          <span class="meta-value"
            >{selectedCommit.authorName} &lt;{selectedCommit.authorEmail}&gt;</span
          >
        </div>
        <div class="meta-row">
          <span class="meta-label">Date:</span>
          <span class="meta-value"
            >{new Date(selectedCommit.date).toLocaleString()}</span
          >
        </div>
        {#if selectedCommit.refs.length > 0}
          <div class="meta-row">
            <span class="meta-label">Labels:</span>
            <span class="meta-value label-badges">
              {#each selectedCommit.refs as ref}
                <span
                  class="ref-label"
                  style="border-color:{refColor(ref)}; background:{refColor(
                    ref,
                  )}22; color:{refColor(ref)}">{ref.replace('tag: ', '')}</span
                >
              {/each}
            </span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .file-list {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg-surface);
    overflow: hidden;
  }

  .file-header {
    padding: 6px 12px;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: 10px;
    flex-shrink: 0;
  }

  .files {
    flex: 1;
    overflow-y: auto;
  }

  .section-header-row {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
  }

  .stage-all-checkbox {
    flex-shrink: 0;
    cursor: pointer;
    accent-color: var(--color-text-accent);
    margin-left: 8px;
  }

  .section-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    flex: 1;
    border: none;
    background: var(--color-bg-surface);
    color: var(--color-text-secondary);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
    text-align: left;
  }

  .section-toggle:hover {
    background: var(--color-bg-hover);
  }

  .expand-arrow {
    font-size: 10px;
    width: 10px;
  }

  .file-count {
    margin-left: auto;
    color: var(--color-text-secondary);
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border: none;
    background: none;
    cursor: pointer;
    width: 100%;
    text-align: left;
    font-size: 11px;
  }

  .file-row:hover {
    background: var(--color-bg-hover);
  }

  .file-row.selected {
    background: var(--color-bg-selected);
  }

  .file-status {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .file-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stage-checkbox {
    flex-shrink: 0;
    cursor: pointer;
    accent-color: var(--color-text-accent);
  }

  .file-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    font-size: 11px;
    padding: 0;
    min-width: 0;
  }

  .commit-info {
    padding: 12px;
    overflow-y: auto;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .commit-info-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .commit-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-white);
    line-height: 1.4;
  }

  .commit-body {
    margin: 0;
    font-size: 11px;
    color: var(--color-text-secondary);
    line-height: 1.5;
    white-space: pre-wrap;
    font-family: system-ui, sans-serif;
  }

  .commit-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .meta-row {
    display: flex;
    font-size: 11px;
    line-height: 1.5;
  }

  .meta-label {
    width: 65px;
    flex-shrink: 0;
    color: var(--color-text-secondary);
    text-align: right;
    padding-right: 8px;
  }

  .meta-value {
    color: var(--color-text-primary);
    word-break: break-all;
  }

  .meta-value.mono {
    font-family: monospace;
    font-size: 11px;
  }

  .parent-links {
    color: var(--color-text-accent);
  }

  .parent-link {
    background: none;
    border: none;
    color: var(--color-text-accent);
    font-family: monospace;
    font-size: 11px;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
  }

  .parent-link:hover {
    color: var(--color-text-white);
  }

  .label-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .ref-label {
    display: inline-block;
    padding: 0 5px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    line-height: 16px;
    border: 1px solid;
    white-space: nowrap;
  }

  .file-context-menu {
    position: fixed;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 4px 0;
    min-width: 160px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 1001;
  }

  .context-item {
    display: block;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: none;
    color: var(--color-text-primary);
    font-size: 11px;
    text-align: left;
    cursor: pointer;
  }

  .context-item:hover {
    background: var(--color-bg-hover);
  }

  .context-item-danger {
    color: var(--color-diff-deleted);
  }

  .context-item-danger:hover {
    background: var(--color-diff-deleted);
    color: var(--color-text-white);
  }

  .context-item:disabled {
    color: var(--color-text-secondary);
    opacity: 0.55;
    cursor: default;
  }

  .context-item:disabled:hover {
    background: none;
  }

  .context-separator {
    height: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }

  .context-item-with-submenu {
    position: relative;
  }

  .context-item-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .submenu-arrow {
    font-size: 14px;
    color: var(--color-text-secondary);
    line-height: 1;
  }

  .submenu {
    display: none;
    position: absolute;
    left: 100%;
    top: -4px;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 4px 0;
    min-width: 280px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 1002;
  }

  .context-item-with-submenu:hover .submenu,
  .context-item-with-submenu:focus-within .submenu {
    display: block;
  }
</style>
