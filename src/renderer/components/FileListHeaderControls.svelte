<script lang="ts">
  import {
    ChevronDown,
    Check,
    List,
    Columns2,
    FolderTree,
  } from '@lucide/svelte';
  import type {
    FileSortMode,
    FileStatusFilter,
    FileViewMode,
    StagingMode,
  } from '../lib/file-list-sort';

  type Context = 'working' | 'historical';

  type Props = {
    context: Context;
    viewMode: FileViewMode;
    sortMode: FileSortMode;
    statusFilter?: FileStatusFilter;
    stagingMode?: StagingMode;
    onViewMode: (mode: FileViewMode) => void;
    onSortMode: (mode: FileSortMode) => void;
    onStatusFilter?: (filter: FileStatusFilter) => void;
    onStagingMode?: (mode: StagingMode) => void;
  };

  let {
    context,
    viewMode,
    sortMode,
    statusFilter,
    stagingMode,
    onViewMode,
    onSortMode,
    onStatusFilter,
    onStagingMode,
  }: Props = $props();

  let leftMenuOpen = $state(false);
  let rightMenuOpen = $state(false);

  const FILTER_LABEL: Record<FileStatusFilter, string> = {
    pending: 'Pending',
    conflicts: 'Conflicts',
    untracked: 'Untracked',
    modified: 'Modified',
  };
  const SORT_LABEL: Record<FileSortMode, string> = {
    'path-asc': 'path',
    'path-desc': 'path (reversed)',
    'name-asc': 'name',
    'name-desc': 'name (reversed)',
    status: 'status',
    checked: 'checked',
  };

  let leftLabel = $derived.by(() => {
    if (context === 'working' && statusFilter) {
      return `${FILTER_LABEL[statusFilter]} files, sorted by ${SORT_LABEL[sortMode]}`;
    }
    return `Sorted by ${SORT_LABEL[sortMode]}`;
  });

  function viewIcon(mode: FileViewMode) {
    if (mode === 'tree') return FolderTree;
    if (mode === 'flat-multi') return Columns2;
    return List;
  }

  function closeAll() {
    leftMenuOpen = false;
    rightMenuOpen = false;
  }

  function toggleLeft(e: MouseEvent) {
    e.stopPropagation();
    rightMenuOpen = false;
    leftMenuOpen = !leftMenuOpen;
  }
  function toggleRight(e: MouseEvent) {
    e.stopPropagation();
    leftMenuOpen = false;
    rightMenuOpen = !rightMenuOpen;
  }

  function pickFilter(f: FileStatusFilter) {
    onStatusFilter?.(f);
    closeAll();
  }
  function pickSort(s: FileSortMode) {
    onSortMode(s);
    closeAll();
  }
  function pickView(v: FileViewMode) {
    onViewMode(v);
    closeAll();
  }
  function pickStaging(s: StagingMode) {
    onStagingMode?.(s);
    closeAll();
  }

  // checked sort only meaningful when there are checkboxes (fluid staging)
  let checkedSortEnabled = $derived(
    context === 'working' && stagingMode === 'fluid',
  );
</script>

<svelte:window
  onclick={() => {
    if (leftMenuOpen || rightMenuOpen) closeAll();
  }}
  onkeydown={(e) => {
    if ((leftMenuOpen || rightMenuOpen) && e.key === 'Escape') closeAll();
  }}
/>

<div class="file-list-header">
  <button
    class="dropdown-trigger left"
    onclick={toggleLeft}
    data-testid="file-list-left-dropdown"
  >
    <span class="trigger-label">{leftLabel}</span>
    <ChevronDown size={12} />
  </button>

  <button
    class="dropdown-trigger right"
    onclick={toggleRight}
    data-testid="file-list-view-dropdown"
    title="View mode"
  >
    <svelte:component this={viewIcon(viewMode)} size={14} />
    <ChevronDown size={12} />
  </button>

  {#if leftMenuOpen}
    <div class="menu menu-left" onclick={(e) => e.stopPropagation()}>
      {#if context === 'working' && statusFilter}
        <div class="menu-section-label">Show only</div>
        <button
          class="menu-item"
          onclick={() => pickFilter('pending')}
          data-testid="filter-pending"
        >
          <span class="menu-check">
            {#if statusFilter === 'pending'}<Check size={12} />{/if}
          </span>
          Pending
        </button>
        <button
          class="menu-item"
          onclick={() => pickFilter('conflicts')}
          data-testid="filter-conflicts"
        >
          <span class="menu-check">
            {#if statusFilter === 'conflicts'}<Check size={12} />{/if}
          </span>
          Conflicts
        </button>
        <button
          class="menu-item"
          onclick={() => pickFilter('untracked')}
          data-testid="filter-untracked"
        >
          <span class="menu-check">
            {#if statusFilter === 'untracked'}<Check size={12} />{/if}
          </span>
          Untracked
        </button>
        <button
          class="menu-item"
          onclick={() => pickFilter('modified')}
          data-testid="filter-modified"
        >
          <span class="menu-check">
            {#if statusFilter === 'modified'}<Check size={12} />{/if}
          </span>
          Modified
        </button>
        <button
          class="menu-item"
          disabled
          title="Coming soon"
          data-testid="filter-ignored"
        >
          <span class="menu-check"></span>
          Ignored
        </button>
        <button class="menu-item" disabled title="Coming soon">
          <span class="menu-check"></span>
          Clean
        </button>
        <button class="menu-item" disabled title="Coming soon">
          <span class="menu-check"></span>
          All files
        </button>
        <div class="menu-separator"></div>
      {/if}

      <div class="menu-section-label">Sort by</div>
      <button
        class="menu-item"
        onclick={() => pickSort('path-asc')}
        data-testid="sort-path-asc"
      >
        <span class="menu-check">
          {#if sortMode === 'path-asc'}<Check size={12} />{/if}
        </span>
        Path alphabetically
      </button>
      <button
        class="menu-item"
        onclick={() => pickSort('path-desc')}
        data-testid="sort-path-desc"
      >
        <span class="menu-check">
          {#if sortMode === 'path-desc'}<Check size={12} />{/if}
        </span>
        Path alphabetically (reversed)
      </button>
      <button
        class="menu-item"
        onclick={() => pickSort('name-asc')}
        data-testid="sort-name-asc"
      >
        <span class="menu-check">
          {#if sortMode === 'name-asc'}<Check size={12} />{/if}
        </span>
        File name alphabetically
      </button>
      <button
        class="menu-item"
        onclick={() => pickSort('name-desc')}
        data-testid="sort-name-desc"
      >
        <span class="menu-check">
          {#if sortMode === 'name-desc'}<Check size={12} />{/if}
        </span>
        File name alphabetically (reversed)
      </button>
      <button
        class="menu-item"
        onclick={() => pickSort('status')}
        data-testid="sort-status"
      >
        <span class="menu-check">
          {#if sortMode === 'status'}<Check size={12} />{/if}
        </span>
        File status
      </button>
      {#if context === 'working'}
        <button
          class="menu-item"
          disabled={!checkedSortEnabled}
          title={checkedSortEnabled ? '' : 'Available with fluid staging'}
          onclick={() => pickSort('checked')}
          data-testid="sort-checked"
        >
          <span class="menu-check">
            {#if sortMode === 'checked'}<Check size={12} />{/if}
          </span>
          Checked / unchecked
        </button>
      {/if}
    </div>
  {/if}

  {#if rightMenuOpen}
    <div class="menu menu-right" onclick={(e) => e.stopPropagation()}>
      <button
        class="menu-item"
        onclick={() => pickView('flat-single')}
        data-testid="view-flat-single"
      >
        <span class="menu-check">
          {#if viewMode === 'flat-single'}<Check size={12} />{/if}
        </span>
        <List size={14} />
        <span class="menu-text">Flat list (single column)</span>
      </button>
      <button
        class="menu-item"
        onclick={() => pickView('flat-multi')}
        data-testid="view-flat-multi"
      >
        <span class="menu-check">
          {#if viewMode === 'flat-multi'}<Check size={12} />{/if}
        </span>
        <Columns2 size={14} />
        <span class="menu-text">Flat list (multiple columns)</span>
      </button>
      <button
        class="menu-item"
        onclick={() => pickView('tree')}
        data-testid="view-tree"
      >
        <span class="menu-check">
          {#if viewMode === 'tree'}<Check size={12} />{/if}
        </span>
        <FolderTree size={14} />
        <span class="menu-text">Tree view</span>
      </button>

      {#if context === 'working' && stagingMode}
        <div class="menu-separator"></div>
        <button
          class="menu-item"
          onclick={() => pickStaging('none')}
          data-testid="staging-none"
        >
          <span class="menu-check">
            {#if stagingMode === 'none'}<Check size={12} />{/if}
          </span>
          <span class="menu-text">No staging</span>
        </button>
        <button
          class="menu-item"
          onclick={() => pickStaging('fluid')}
          data-testid="staging-fluid"
        >
          <span class="menu-check">
            {#if stagingMode === 'fluid'}<Check size={12} />{/if}
          </span>
          <span class="menu-text">Fluid staging</span>
        </button>
        <button
          class="menu-item"
          onclick={() => pickStaging('split')}
          data-testid="staging-split"
        >
          <span class="menu-check">
            {#if stagingMode === 'split'}<Check size={12} />{/if}
          </span>
          <span class="menu-text">Split view staging</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .file-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 8px;
    background: var(--color-bg-surface, #1e1e22);
    border-bottom: 1px solid var(--color-border, #2a2a2e);
    font-size: 10px;
    color: var(--color-text-secondary, #aaa);
    text-transform: none;
    letter-spacing: 0;
    position: relative;
    flex-shrink: 0;
  }

  .dropdown-trigger {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 4px;
    background: transparent;
    color: var(--color-text-secondary, #aaa);
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    line-height: 16px;
    font-family: inherit;
  }

  .dropdown-trigger:hover {
    background: var(--color-bg-hover, #2a2a2e);
    color: var(--color-text-white, #fff);
  }

  .trigger-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }

  .menu {
    position: absolute;
    top: 100%;
    z-index: 200;
    background: var(--color-bg-surface, #1e1e22);
    border: 1px solid var(--color-border, #2a2a2e);
    border-radius: 6px;
    padding: 4px 0;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    min-width: 240px;
  }

  .menu-left {
    left: 8px;
  }

  .menu-right {
    right: 8px;
  }

  .menu-section-label {
    padding: 6px 12px 4px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-tertiary, #777);
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: none;
    color: var(--color-text-primary);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
  }

  .menu-item:hover:not(:disabled) {
    background: var(--color-bg-selected);
    color: var(--color-text-white);
  }

  .menu-item:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .menu-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    color: var(--color-text-accent, #58a6ff);
  }

  .menu-text {
    flex: 1;
  }

  .menu-separator {
    height: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }
</style>
