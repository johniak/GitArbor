<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import type { FileDiff, DiffLineType } from '../types';

  type Props = {
    diff: FileDiff | null;
    isWorkingChanges?: boolean;
    isStaged?: boolean;
    onStageHunk?: (hunkIndex: number) => void;
    onUnstageHunk?: (hunkIndex: number) => void;
    onStageLines?: (hunkIndex: number, lineIndices: number[]) => void;
    onUnstageLines?: (hunkIndex: number, lineIndices: number[]) => void;
    onDiscardLines?: (hunkIndex: number, lineIndices: number[]) => void;
  };

  let {
    diff,
    isWorkingChanges = false,
    isStaged = false,
    onStageHunk,
    onUnstageHunk,
    onStageLines,
    onUnstageLines,
    onDiscardLines,
  }: Props = $props();

  // Line selection state
  let selectedLines = new SvelteSet<string>();
  let lastClickedLine = $state<string | null>(null);
  let contextMenuPos = $state<{ x: number; y: number } | null>(null);
  // Which hunk the context menu targets
  let contextMenuHunk = $state<number | null>(null);

  function lineKey(hunkIdx: number, lineIdx: number): string {
    return `${hunkIdx}:${lineIdx}`;
  }

  function handleLineClick(
    e: MouseEvent,
    hunkIdx: number,
    lineIdx: number,
    type: DiffLineType,
  ) {
    if (!isWorkingChanges || type === 'context') return;
    const key = lineKey(hunkIdx, lineIdx);

    if (e.metaKey || e.ctrlKey) {
      if (selectedLines.has(key)) selectedLines.delete(key);
      else selectedLines.add(key);
      lastClickedLine = key;
    } else if (e.shiftKey && lastClickedLine) {
      const [lastH, lastL] = lastClickedLine.split(':').map(Number);
      if (lastH === hunkIdx) {
        const [start, end] =
          lastL < lineIdx ? [lastL, lineIdx] : [lineIdx, lastL];
        const hunk = diff!.hunks[hunkIdx];
        for (let i = start; i <= end; i++) {
          if (hunk.lines[i].type !== 'context') {
            selectedLines.add(lineKey(hunkIdx, i));
          }
        }
      }
    } else {
      selectedLines.clear();
      selectedLines.add(key);
      lastClickedLine = key;
    }
  }

  function handleLineContextMenu(
    e: MouseEvent,
    hunkIdx: number,
    lineIdx: number,
    type: DiffLineType,
  ) {
    if (!isWorkingChanges || type === 'context') return;
    e.preventDefault();
    const key = lineKey(hunkIdx, lineIdx);

    // If right-clicking an unselected line, select only it
    if (!selectedLines.has(key)) {
      selectedLines.clear();
      selectedLines.add(key);
      lastClickedLine = key;
    }

    contextMenuHunk = hunkIdx;
    const x = Math.min(e.clientX, window.innerWidth - 170);
    const y = Math.min(e.clientY, window.innerHeight - 120);
    contextMenuPos = { x, y };
  }

  function closeContextMenu() {
    contextMenuPos = null;
    contextMenuHunk = null;
  }

  function getSelectedLineIndices(hunkIdx: number): number[] {
    const indices: number[] = [];
    for (const key of selectedLines) {
      const [h, l] = key.split(':').map(Number);
      if (h === hunkIdx) indices.push(l);
    }
    return indices.sort((a, b) => a - b);
  }

  function handleContextAction(action: 'stage' | 'unstage' | 'discard') {
    if (contextMenuHunk == null) return;
    const indices = getSelectedLineIndices(contextMenuHunk);
    if (indices.length === 0) return;

    if (action === 'stage') onStageLines?.(contextMenuHunk, indices);
    else if (action === 'unstage') onUnstageLines?.(contextMenuHunk, indices);
    else if (action === 'discard') onDiscardLines?.(contextMenuHunk, indices);

    selectedLines.clear();
    closeContextMenu();
  }

  function lineClass(type: DiffLineType): string {
    if (type === 'added') return 'line-added';
    if (type === 'removed') return 'line-removed';
    return '';
  }

  function linePrefix(type: DiffLineType): string {
    if (type === 'added') return '+';
    if (type === 'removed') return '-';
    return ' ';
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

<div class="diff-viewer">
  {#if diff}
    <div class="diff-header">{diff.path}</div>
    <div class="diff-content">
      {#if diff.binary}
        <div class="diff-line"><span class="line-text">Binary file</span></div>
      {:else}
        {#each diff.hunks as hunk, hi}
          <div class="diff-line hunk-header">
            <span class="hunk-info"
              >Hunk {hi + 1}: {hunk.header.replace(/^@@.*@@\s*/, '') ||
                `Lines ${hunk.lines[0]?.oldLine ?? '?'}`}</span
            >
            {#if isWorkingChanges}
              <button
                class="hunk-action"
                onclick={() =>
                  isStaged ? onUnstageHunk?.(hi) : onStageHunk?.(hi)}
              >
                {isStaged ? 'Unstage hunk' : 'Stage hunk'}
              </button>
            {/if}
          </div>
          {#each hunk.lines as line, li}
            <div
              class="diff-line {lineClass(line.type)}"
              class:line-selectable={isWorkingChanges &&
                line.type !== 'context'}
              class:line-selected={selectedLines.has(lineKey(hi, li))}
              onclick={(e) => handleLineClick(e, hi, li, line.type)}
              oncontextmenu={(e) => handleLineContextMenu(e, hi, li, line.type)}
            >
              <span class="line-num">{line.oldLine ?? ''}</span>
              <span class="line-num">{line.newLine ?? ''}</span>
              <span class="line-prefix">{linePrefix(line.type)}</span>
              <span class="line-text">{line.content}</span>
            </div>
          {/each}
        {/each}
      {/if}
    </div>
  {:else}
    <div class="diff-empty">Select a file to view diff</div>
  {/if}
</div>

{#if contextMenuPos && selectedLines.size > 0}
  <div
    class="diff-context-menu"
    style="left:{contextMenuPos.x}px;top:{contextMenuPos.y}px"
    onclick={(e) => e.stopPropagation()}
  >
    {#if isStaged}
      <button
        class="context-item"
        onclick={() => handleContextAction('unstage')}
      >
        Unstage {selectedLines.size === 1
          ? 'line'
          : `${selectedLines.size} lines`}
      </button>
    {:else}
      <button class="context-item" onclick={() => handleContextAction('stage')}>
        Stage {selectedLines.size === 1
          ? 'line'
          : `${selectedLines.size} lines`}
      </button>
      <button
        class="context-item context-item-danger"
        onclick={() => handleContextAction('discard')}
      >
        Discard {selectedLines.size === 1
          ? 'line'
          : `${selectedLines.size} lines`}
      </button>
    {/if}
  </div>
{/if}

<style>
  .diff-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg-base);
    overflow: hidden;
  }

  .diff-header {
    padding: 6px 12px;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: 11px;
    flex-shrink: 0;
    font-family: monospace;
  }

  .diff-content {
    flex: 1;
    overflow: auto;
    padding: 4px 0;
    font-family: monospace;
    font-size: 11px;
    line-height: 1.6;
  }

  .diff-line {
    display: flex;
    padding: 0 12px;
    white-space: pre;
  }

  .line-added {
    background: var(--color-diff-added-bg);
  }

  .line-removed {
    background: var(--color-diff-deleted-bg);
  }

  .line-selectable {
    cursor: pointer;
  }

  .line-selectable:hover {
    filter: brightness(1.3);
  }

  .line-selected {
    outline: 1px solid var(--color-text-accent);
    outline-offset: -1px;
  }

  .line-num {
    width: 36px;
    flex-shrink: 0;
    color: var(--color-text-secondary);
    text-align: right;
    padding-right: 8px;
    user-select: none;
  }

  .line-prefix {
    width: 16px;
    flex-shrink: 0;
    color: var(--color-diff-added);
  }

  .line-removed .line-prefix {
    color: var(--color-diff-deleted);
  }

  .line-text {
    color: var(--color-text-primary);
  }

  .hunk-header {
    background: var(--color-bg-surface);
    color: var(--color-text-secondary);
    padding: 4px 12px;
    margin-top: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .hunk-info {
    font-size: 11px;
  }

  .hunk-action {
    background: var(--color-bg-hover);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 9px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .hunk-action:hover {
    background: var(--color-bg-selected);
    color: var(--color-text-white);
  }

  .diff-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .diff-context-menu {
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
</style>
