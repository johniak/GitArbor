<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import Splitter from './Splitter.svelte';
  import FileRow from './FileRow.svelte';
  import FileListHeaderControls from './FileListHeaderControls.svelte';
  import CommitInfoPanel from './CommitInfoPanel.svelte';
  import type {
    ChangedFile,
    Commit,
    FileStatus,
    WorkingStatus,
  } from '../types';
  import {
    buildFileTree,
    collectDirPaths,
    filterFiles,
    flattenTree,
    sortFiles,
    type FileSortMode,
    type FileStatusFilter,
    type FileViewMode,
    type StagingMode,
  } from '../lib/file-list-sort';

  type Props = {
    files: ChangedFile[];
    workingStatus?: WorkingStatus | null;
    isWorkingChanges?: boolean;
    selectedPath?: string | null;
    selectedCommit?: Commit | null;
    commitBody?: string;
    /** View / sort / filter / staging settings (reactive from settings store). */
    viewMode?: FileViewMode;
    sortMode?: FileSortMode;
    statusFilter?: FileStatusFilter;
    stagingMode?: StagingMode;
    /** Per-session exclusions for no-staging mode. */
    excludedPaths?: ReadonlySet<string>;
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
    onViewMode?: (mode: FileViewMode) => void;
    onSortMode?: (mode: FileSortMode) => void;
    onStatusFilter?: (filter: FileStatusFilter) => void;
    onStagingMode?: (mode: StagingMode) => void;
    onToggleExclude?: (path: string) => void;
  };

  let {
    files,
    workingStatus = null,
    isWorkingChanges = false,
    selectedPath = null,
    selectedCommit = null,
    commitBody = '',
    viewMode = 'flat-single',
    sortMode = 'path-asc',
    statusFilter = 'pending',
    stagingMode = 'split',
    excludedPaths,
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
    onViewMode,
    onSortMode,
    onStatusFilter,
    onStagingMode,
    onToggleExclude,
  }: Props = $props();

  let stagedExpanded = $state(true);
  let unstagedExpanded = $state(true);
  let commitInfoHeight = $state(200);

  let selectedKeys = new SvelteSet<string>();
  let lastClickedKey = $state<string | null>(null);

  function selKey(path: string, staged: boolean): string {
    return `${path}\0${staged}`;
  }

  let contextMenuPos = $state<{ x: number; y: number } | null>(null);
  let contextMenuFiles = $state<
    Array<{ path: string; status: FileStatus; staged: boolean }>
  >([]);

  // Tree expand/collapse state (session only)
  let expandedDirs = new SvelteSet<string>();

  // ── Filtered + sorted views ──────────────────────────────────
  let stagedSorted = $derived.by(() => {
    if (!workingStatus) return [];
    return sortFiles(
      filterFiles(workingStatus.staged, statusFilter),
      sortMode,
      new Set(workingStatus.staged.map((f) => f.path)),
    );
  });

  let unstagedSorted = $derived.by(() => {
    if (!workingStatus) return [];
    return sortFiles(
      filterFiles(workingStatus.unstaged, statusFilter),
      sortMode,
      new Set(workingStatus.staged.map((f) => f.path)),
    );
  });

  let stagedPathSet = $derived.by(() => {
    const s = new SvelteSet<string>();
    for (const f of workingStatus?.staged ?? []) s.add(f.path);
    return s;
  });

  /** Combined list for fluid / no-staging modes. Same path may exist
   *  in both staged and unstaged; collapse to one row, prefer staged. */
  let combinedSorted = $derived.by(() => {
    if (!workingStatus) return [];
    const seen = new SvelteSet<string>();
    const merged: ChangedFile[] = [];
    for (const f of workingStatus.staged) {
      if (!seen.has(f.path)) {
        seen.add(f.path);
        merged.push(f);
      }
    }
    for (const f of workingStatus.unstaged) {
      if (!seen.has(f.path)) {
        seen.add(f.path);
        merged.push(f);
      }
    }
    return sortFiles(
      filterFiles(merged, statusFilter),
      sortMode,
      stagedPathSet,
    );
  });

  let commitSorted = $derived.by(() => sortFiles(files, sortMode));

  // Tree projections
  let stagedTree = $derived(buildFileTree(stagedSorted, sortMode));
  let unstagedTree = $derived(buildFileTree(unstagedSorted, sortMode));
  let combinedTree = $derived(buildFileTree(combinedSorted, sortMode));
  let commitTree = $derived(buildFileTree(commitSorted, sortMode));

  let stagedTreeRows = $derived(flattenTree(stagedTree, expandedDirs));
  let unstagedTreeRows = $derived(flattenTree(unstagedTree, expandedDirs));
  let combinedTreeRows = $derived(flattenTree(combinedTree, expandedDirs));
  let commitTreeRows = $derived(flattenTree(commitTree, expandedDirs));

  // Auto-expand all directories the first time we switch into tree view.
  $effect(() => {
    if (viewMode !== 'tree') return;
    let nodes;
    if (isWorkingChanges) {
      nodes =
        stagingMode === 'split'
          ? [...stagedTree, ...unstagedTree]
          : combinedTree;
    } else {
      nodes = commitTree;
    }
    if (expandedDirs.size === 0) {
      for (const path of collectDirPaths(nodes)) expandedDirs.add(path);
    }
  });

  function toggleDir(path: string) {
    if (expandedDirs.has(path)) expandedDirs.delete(path);
    else expandedDirs.add(path);
  }

  // ── Ordered list for shift-click range selection ─────────────
  let allWorkingFiles = $derived.by(() => {
    if (!workingStatus)
      return [] as Array<{
        path: string;
        status: FileStatus;
        staged: boolean;
        key: string;
      }>;
    const out: Array<{
      path: string;
      status: FileStatus;
      staged: boolean;
      key: string;
    }> = [];
    if (stagingMode === 'split') {
      for (const f of stagedSorted)
        out.push({
          path: f.path,
          status: f.status,
          staged: true,
          key: selKey(f.path, true),
        });
      for (const f of unstagedSorted)
        out.push({
          path: f.path,
          status: f.status,
          staged: false,
          key: selKey(f.path, false),
        });
    } else {
      for (const f of combinedSorted) {
        const staged = stagedPathSet.has(f.path);
        out.push({
          path: f.path,
          status: f.status,
          staged,
          key: selKey(f.path, staged),
        });
      }
    }
    return out;
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
      contextMenuFiles = allWorkingFiles.filter((f) => selectedKeys.has(f.key));
    } else {
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

  function isExcluded(path: string): boolean {
    return excludedPaths?.has(path) ?? false;
  }

  // Decide whether a given row in commit-detail context is selected.
  function commitRowSelected(path: string): boolean {
    return selectedPath === path;
  }
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
  <FileListHeaderControls
    context={isWorkingChanges ? 'working' : 'historical'}
    {viewMode}
    {sortMode}
    statusFilter={isWorkingChanges ? statusFilter : undefined}
    stagingMode={isWorkingChanges ? stagingMode : undefined}
    onViewMode={(m) => onViewMode?.(m)}
    onSortMode={(m) => onSortMode?.(m)}
    onStatusFilter={(f) => onStatusFilter?.(f)}
    onStagingMode={(m) => onStagingMode?.(m)}
  />

  {#snippet flatBody(
    items: ChangedFile[],
    staged: boolean,
    withCheckbox: boolean,
    multi: boolean,
  )}
    <div
      class="files-body"
      class:multi-col={multi}
      class:multi-col-with-checkbox={multi && withCheckbox}
    >
      {#if multi}
        <div class="multi-col-header">
          <span class="checkbox-col"></span>
          <span class="status-col"></span>
          <span class="filename-col">Filename</span>
          <span class="path-col">Path</span>
        </div>
      {/if}
      {#each items as file (file.path + (staged ? '~s' : '~u'))}
        <FileRow
          {file}
          selected={selectedKeys.has(selKey(file.path, staged))}
          showCheckbox={withCheckbox}
          checked={stagedPathSet.has(file.path)}
          excluded={stagingMode === 'none' && isExcluded(file.path)}
          {multi}
          onClick={(e) => handleFileClick(e, file.path, file.status, staged)}
          onContextMenu={(e) =>
            openContextMenu(e, file.path, file.status, staged)}
          onCheckChange={() =>
            onStageFile?.(file.path, !stagedPathSet.has(file.path))}
        />
      {/each}
    </div>
  {/snippet}

  {#snippet treeBody(
    rows: ReturnType<typeof flattenTree>,
    staged: boolean,
    withCheckbox: boolean,
  )}
    <div class="files-body">
      {#each rows as row (row.kind === 'dir' ? `d:${row.path}` : `f:${row.file.path}~${staged}`)}
        {#if row.kind === 'dir'}
          <button
            type="button"
            class="dir-row"
            style="padding-left: {12 + row.depth * 12}px"
            onclick={() => toggleDir(row.path)}
            data-testid="tree-dir"
          >
            <span class="expand-arrow">{row.collapsed ? '▸' : '▾'}</span>
            <span class="dir-name">{row.name}</span>
          </button>
        {:else}
          <FileRow
            file={row.file}
            indent={row.depth * 12}
            displayLabel={row.file.path.split('/').pop()}
            selected={isWorkingChanges
              ? selectedKeys.has(selKey(row.file.path, staged))
              : commitRowSelected(row.file.path)}
            showCheckbox={withCheckbox}
            checked={stagedPathSet.has(row.file.path)}
            excluded={stagingMode === 'none' && isExcluded(row.file.path)}
            onClick={(e) => {
              if (isWorkingChanges)
                handleFileClick(e, row.file.path, row.file.status, staged);
              else onSelectFile?.(row.file.path, false);
            }}
            onContextMenu={(e) =>
              openContextMenu(e, row.file.path, row.file.status, staged)}
            onCheckChange={() =>
              onStageFile?.(row.file.path, !stagedPathSet.has(row.file.path))}
          />
        {/if}
      {/each}
    </div>
  {/snippet}

  {#snippet body(items: ChangedFile[], staged: boolean, withCheckbox: boolean)}
    {#if viewMode === 'tree'}
      {@render treeBody(
        staged
          ? stagedTreeRows
          : isWorkingChanges
            ? stagingMode === 'split'
              ? unstagedTreeRows
              : combinedTreeRows
            : commitTreeRows,
        staged,
        withCheckbox,
      )}
    {:else}
      {@render flatBody(items, staged, withCheckbox, viewMode === 'flat-multi')}
    {/if}
  {/snippet}

  {#if isWorkingChanges && workingStatus}
    <div class="files">
      {#if stagingMode === 'split'}
        <!-- Staged section -->
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
            data-testid="section-staged"
            onclick={() => (stagedExpanded = !stagedExpanded)}
          >
            <span class="expand-arrow">{stagedExpanded ? '▾' : '▸'}</span>
            Staged files
            <span class="file-count">{stagedSorted.length}</span>
          </button>
        </div>
        {#if stagedExpanded}
          {@render body(stagedSorted, true, false)}
        {/if}
        <!-- Unstaged section -->
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
            data-testid="section-unstaged"
            onclick={() => (unstagedExpanded = !unstagedExpanded)}
          >
            <span class="expand-arrow">{unstagedExpanded ? '▾' : '▸'}</span>
            Unstaged files
            <span class="file-count">{unstagedSorted.length}</span>
          </button>
        </div>
        {#if unstagedExpanded}
          {@render body(unstagedSorted, false, false)}
        {/if}
      {:else if stagingMode === 'fluid'}
        {@render body(combinedSorted, false, true)}
      {:else}
        <!-- stagingMode === 'none' -->
        {@render body(combinedSorted, false, false)}
      {/if}
    </div>
  {:else}
    <div class="files">
      {#if viewMode === 'tree'}
        <div class="files-body">
          {#each commitTreeRows as row (row.kind === 'dir' ? `d:${row.path}` : `f:${row.file.path}`)}
            {#if row.kind === 'dir'}
              <button
                type="button"
                class="dir-row"
                style="padding-left: {12 + row.depth * 12}px"
                onclick={() => toggleDir(row.path)}
                data-testid="tree-dir"
              >
                <span class="expand-arrow">{row.collapsed ? '▸' : '▾'}</span>
                <span class="dir-name">{row.name}</span>
              </button>
            {:else}
              <FileRow
                file={row.file}
                indent={row.depth * 12}
                displayLabel={row.file.path.split('/').pop()}
                selected={selectedPath === row.file.path}
                onClick={() => onSelectFile?.(row.file.path, false)}
              />
            {/if}
          {/each}
        </div>
      {:else}
        <div class="files-body" class:multi-col={viewMode === 'flat-multi'}>
          {#if viewMode === 'flat-multi'}
            <div class="multi-col-header">
              <span class="checkbox-col"></span>
              <span class="status-col"></span>
              <span class="filename-col">Filename</span>
              <span class="path-col">Path</span>
            </div>
          {/if}
          {#each commitSorted as file (file.path)}
            <FileRow
              {file}
              selected={selectedPath === file.path}
              multi={viewMode === 'flat-multi'}
              onClick={() => onSelectFile?.(file.path, false)}
            />
          {/each}
        </div>
      {/if}
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
        {#if stagingMode === 'none'}
          <button
            class="context-item"
            onclick={() => {
              onToggleExclude?.(contextMenuFiles[0].path);
              closeContextMenu();
            }}
            data-testid="toggle-exclude"
            >{isExcluded(contextMenuFiles[0].path)
              ? 'Include in next commit'
              : 'Exclude from next commit'}</button
          >
        {/if}
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
    <div class="commit-info-wrap" style="height:{commitInfoHeight}px">
      <CommitInfoPanel
        commit={selectedCommit}
        body={commitBody}
        {onSelectParent}
      />
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

  .files {
    flex: 1;
    overflow-y: auto;
  }

  .files-body {
    display: block;
  }

  .files-body.multi-col {
    display: grid;
    grid-template-columns: 12px 16px minmax(120px, 1fr) minmax(120px, 1fr);
    column-gap: 8px;
    align-items: center;
  }

  .multi-col-header {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    padding: 4px 12px;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--color-bg-surface);
    position: sticky;
    top: 0;
    z-index: 1;
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

  .dir-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border: none;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    width: 100%;
    text-align: left;
    font-size: 11px;
  }

  .dir-row:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .dir-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .commit-info-wrap {
    flex-shrink: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
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
