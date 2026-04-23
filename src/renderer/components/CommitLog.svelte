<script lang="ts">
  import type { Commit, GraphRow } from '../types';
  import GraphCell from './GraphCell.svelte';
  import { clampWidth, type ColumnKey } from '../column-widths';
  import { settingsStore } from '../settings-store.svelte';

  type Props = {
    commits: Commit[];
    graphRows: GraphRow[];
    selectedHash?: string | null;
    onSelectCommit?: (hash: string) => void;
    onLoadMore?: () => void;
    hasMore?: boolean;
    loading?: boolean;
    showAll?: boolean;
    onToggleAll?: (all: boolean) => void;
    logOrder?: 'date' | 'topo';
    onToggleLogOrder?: (order: 'date' | 'topo') => void;
    onCheckoutCommit?: (hash: string) => void;
    onCommitContextMenu?: (
      hash: string,
      subject: string,
      x: number,
      y: number,
    ) => void;
    scrollToIndex?: number | null;
  };

  let {
    commits,
    graphRows,
    selectedHash = null,
    onSelectCommit,
    onLoadMore,
    hasMore = false,
    loading = false,
    showAll = false,
    onToggleAll,
    logOrder = 'date',
    onToggleLogOrder,
    onCheckoutCommit,
    onCommitContextMenu,
    scrollToIndex = null,
  }: Props = $props();

  function refLabel(ref: string): string {
    return ref.replace('tag: ', '');
  }

  const ROW_HEIGHT = 24;
  const LANE_WIDTH = 10;
  const LOAD_MORE_THRESHOLD = 200;
  const ROW_PADDING_LEFT = 12;

  // Virtual scroll state
  let scrollContainer: HTMLDivElement | undefined = $state();
  let scrollTop = $state(0);
  let scrollLeft = $state(0);
  let containerHeight = $state(400);

  let visibleStart = $derived(Math.floor(scrollTop / ROW_HEIGHT));
  let visibleCount = $derived(Math.ceil(containerHeight / ROW_HEIGHT) + 2);
  let visibleEnd = $derived(
    Math.min(visibleStart + visibleCount, commits.length),
  );
  let totalHeight = $derived(commits.length * ROW_HEIGHT);
  let offsetY = $derived(visibleStart * ROW_HEIGHT);

  $effect(() => {
    if (scrollToIndex != null && scrollContainer) {
      scrollContainer.scrollTop = scrollToIndex * ROW_HEIGHT;
    }
  });

  function onScroll() {
    if (!scrollContainer) return;
    scrollTop = scrollContainer.scrollTop;
    scrollLeft = scrollContainer.scrollLeft;

    // Infinite scroll: trigger load more when near bottom
    const distanceToBottom =
      scrollContainer.scrollHeight -
      scrollContainer.scrollTop -
      scrollContainer.clientHeight;
    if (distanceToBottom < LOAD_MORE_THRESHOLD && hasMore && !loading) {
      onLoadMore?.();
    }
  }

  function onResize(el: HTMLDivElement) {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight = entry.contentRect.height;
      }
    });
    observer.observe(el);
    return { destroy: () => observer.disconnect() };
  }

  function select(hash: string) {
    onSelectCommit?.(hash);
  }

  let maxLaneCount = $derived(
    graphRows.reduce((max, r) => Math.max(max, r.laneCount), 1),
  );

  // Resizable columns — read from per-repo settings store
  let widths = $derived(settingsStore.settings.columns);

  let sumWidth = $derived(
    ROW_PADDING_LEFT +
      widths.graph +
      widths.desc +
      widths.hash +
      widths.author +
      widths.date,
  );

  let dragging: {
    column: ColumnKey;
    startX: number;
    startWidth: number;
  } | null = null;

  function onGlobalMove(e: PointerEvent) {
    if (!dragging) return;
    const proposed = dragging.startWidth + (e.clientX - dragging.startX);
    const clamped = clampWidth(proposed);
    settingsStore.update({ columns: { [dragging.column]: clamped } });
  }

  function onGlobalEnd() {
    if (!dragging) return;
    dragging = null;
    window.removeEventListener('pointermove', onGlobalMove);
    window.removeEventListener('pointerup', onGlobalEnd);
    window.removeEventListener('pointercancel', onGlobalEnd);
  }

  function startResize(e: PointerEvent, column: ColumnKey) {
    e.stopPropagation();
    e.preventDefault();
    dragging = {
      column,
      startX: e.clientX,
      startWidth: widths[column],
    };
    window.addEventListener('pointermove', onGlobalMove);
    window.addEventListener('pointerup', onGlobalEnd);
    window.addEventListener('pointercancel', onGlobalEnd);
  }
</script>

<div class="commit-log">
  <div class="top-bar">
    <button
      class="branch-toggle"
      data-testid="branches-toggle"
      onclick={() => onToggleAll?.(!showAll)}
    >
      {showAll ? 'All Branches' : 'Current Branch'}
    </button>
    <button
      class="branch-toggle"
      data-testid="log-order-toggle"
      onclick={() => onToggleLogOrder?.(logOrder === 'date' ? 'topo' : 'date')}
    >
      {logOrder === 'topo' ? 'Ancestor Order' : 'Date Order'}
    </button>
  </div>
  <div class="header-clip">
    <div
      class="header-row"
      style="width:{sumWidth}px; transform:translateX({-scrollLeft}px)"
    >
      <div class="col-graph header-cell" style="width:{widths.graph}px">
        <span class="header-label">Graph</span>
        <div
          class="col-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize graph column"
          data-column="graph"
          onpointerdown={(e) => startResize(e, 'graph')}
        ></div>
      </div>
      <div class="col-desc header-cell" style="width:{widths.desc}px">
        <span class="header-label">Description</span>
        <div
          class="col-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize description column"
          data-column="desc"
          onpointerdown={(e) => startResize(e, 'desc')}
        ></div>
      </div>
      <div class="col-hash header-cell" style="width:{widths.hash}px">
        <span class="header-label">Commit</span>
        <div
          class="col-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize commit column"
          data-column="hash"
          onpointerdown={(e) => startResize(e, 'hash')}
        ></div>
      </div>
      <div class="col-author header-cell" style="width:{widths.author}px">
        <span class="header-label">Author</span>
        <div
          class="col-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize author column"
          data-column="author"
          onpointerdown={(e) => startResize(e, 'author')}
        ></div>
      </div>
      <div class="col-date header-cell" style="width:{widths.date}px">
        <span class="header-label">Date</span>
        <div
          class="col-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize date column"
          data-column="date"
          onpointerdown={(e) => startResize(e, 'date')}
        ></div>
      </div>
    </div>
  </div>
  <div
    class="rows"
    bind:this={scrollContainer}
    onscroll={onScroll}
    use:onResize
  >
    <div
      class="scroll-spacer"
      style="width:{sumWidth}px; height:{totalHeight}px"
    >
      <div class="visible-window" style="transform:translateY({offsetY}px)">
        {#each { length: visibleEnd - visibleStart } as _, i}
          {@const idx = visibleStart + i}
          {@const commit = commits[idx]}
          {@const row = graphRows[idx]}
          {#if commit && row}
            {@const isHead = commit.refs.some((r) => r.startsWith('HEAD'))}
            <button
              class="commit-row"
              class:selected={selectedHash === commit.hashShort}
              class:head-commit={isHead}
              onclick={() => select(commit.hashShort)}
              ondblclick={() => onCheckoutCommit?.(commit.hash)}
              oncontextmenu={(e) => {
                e.preventDefault();
                onCommitContextMenu?.(
                  commit.hash,
                  commit.message,
                  e.clientX,
                  e.clientY,
                );
              }}
              style="height:{ROW_HEIGHT}px"
            >
              <div class="col-graph" style="width:{widths.graph}px">
                <GraphCell
                  {row}
                  height={ROW_HEIGHT}
                  laneWidth={LANE_WIDTH}
                  maxLanes={maxLaneCount}
                  {isHead}
                />
              </div>
              <div class="col-desc" style="width:{widths.desc}px">
                {#each commit.refs as ref}
                  <span
                    class="ref-badge"
                    style="border-color:{row.commitColor}; background:{row.commitColor}22; color:{row.commitColor}"
                    >{refLabel(ref)}</span
                  >
                {/each}
                {commit.message}
              </div>
              <div class="col-hash" style="width:{widths.hash}px">
                {commit.hashShort}
              </div>
              <div class="col-author" style="width:{widths.author}px">
                {commit.authorName}
              </div>
              <div class="col-date" style="width:{widths.date}px">
                {commit.dateRelative}
              </div>
            </button>
          {/if}
        {/each}
      </div>
    </div>
    {#if loading}
      <div class="loading-indicator">Loading more commits...</div>
    {/if}
  </div>
</div>

<style>
  .commit-log {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .top-bar {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding: 2px 12px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .header-clip {
    overflow: hidden;
    flex-shrink: 0;
  }

  .header-row {
    display: flex;
    padding: 4px 0 4px 12px;
    box-sizing: border-box;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
  }

  .header-row > div {
    color: var(--color-text-secondary);
    font-size: 10px;
  }

  .rows {
    flex: 1;
    overflow: auto;
  }

  .scroll-spacer {
    position: relative;
  }

  .visible-window {
    position: absolute;
    left: 0;
    right: 0;
  }

  .commit-row {
    display: flex;
    align-items: center;
    padding: 0 0 0 12px;
    box-sizing: border-box;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .commit-row:hover {
    background: var(--color-bg-hover);
  }

  .commit-row.selected {
    background: var(--color-bg-selected);
  }

  .commit-row.selected .col-desc {
    color: var(--color-text-white);
  }

  .commit-row.head-commit .col-desc {
    color: var(--color-text-white);
    font-weight: 700;
  }

  .col-graph {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    /* Keep horizontal clip (graph column width), but allow vertical bleed
       so adjacent rows' GraphCell SVGs can overlap by 1px and avoid a
       subpixel seam on Linux. */
    overflow-x: clip;
    overflow-y: visible;
  }

  .col-desc {
    flex-shrink: 0;
    color: var(--color-text-primary);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .col-hash {
    flex-shrink: 0;
    color: var(--color-text-secondary);
    font-size: 10px;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-author {
    flex-shrink: 0;
    color: var(--color-text-accent-light);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-date {
    flex-shrink: 0;
    color: var(--color-text-secondary);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-cell {
    position: relative;
    display: flex;
    align-items: center;
    overflow: visible;
  }

  .header-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .col-resizer {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 8px;
    cursor: col-resize;
    z-index: 1;
    touch-action: none;
  }

  .col-resizer::after {
    content: '';
    position: absolute;
    top: 3px;
    bottom: 3px;
    right: 3px;
    width: 1px;
    background: var(--color-border);
    transition:
      background 0.15s,
      width 0.15s;
  }

  .col-resizer:hover::after,
  .col-resizer:active::after {
    background: var(--color-text-accent);
    width: 2px;
    right: 2.5px;
  }

  .loading-indicator {
    padding: 8px 12px;
    color: var(--color-text-secondary);
    font-size: 11px;
    text-align: center;
    font-style: italic;
  }

  /* Ref badges — color set inline from graph lane color */
  .ref-badge {
    display: inline-block;
    padding: 0 5px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    line-height: 16px;
    white-space: nowrap;
    flex-shrink: 0;
    border: 1px solid;
  }

  /* Branch toggle */
  .branch-toggle {
    background: var(--color-bg-hover);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 9px;
    cursor: pointer;
  }

  .branch-toggle:hover {
    background: var(--color-bg-selected);
    color: var(--color-text-white);
  }
</style>
