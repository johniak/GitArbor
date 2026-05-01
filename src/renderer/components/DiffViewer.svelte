<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { Rows3, Columns2 } from '@lucide/svelte';
  import type { AppSettings, DiffViewMode } from '../../shared/ipc';
  import type { FileDiff, DiffLine, DiffLineType } from '../types';
  import { themeStore } from '../theme-store.svelte';
  import {
    detectLanguage,
    highlightLines,
    type Lang,
  } from '../lib/syntax-highlight';
  import {
    pairLinesForSplit,
    wordDiffPair,
    type WordSpan,
  } from '../lib/diff-pair';
  import { SvelteMap } from 'svelte/reactivity';

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

  // ── Settings (persistent, app-wide) ────────────────────────────
  let viewMode = $state<DiffViewMode>('unified');
  let syntaxOn = $state(true);
  let wordDiffOn = $state(true);
  let offSettings: (() => void) | undefined;

  function applySettings(s: AppSettings) {
    viewMode = s.diff.viewMode;
    syntaxOn = s.diff.syntaxHighlight;
    wordDiffOn = s.diff.wordDiff;
  }

  onMount(async () => {
    try {
      const s = await window.electronAPI.appSettings.get();
      applySettings(s);
    } catch {
      // keep defaults
    }
    offSettings = window.electronAPI.appSettings.onChanged((s) =>
      applySettings(s),
    );
  });
  onDestroy(() => offSettings?.());

  async function setViewMode(mode: DiffViewMode) {
    viewMode = mode;
    await window.electronAPI.appSettings.update({ diff: { viewMode: mode } });
  }
  async function toggleSyntax() {
    syntaxOn = !syntaxOn;
    await window.electronAPI.appSettings.update({
      diff: { syntaxHighlight: syntaxOn },
    });
  }
  async function toggleWordDiff() {
    wordDiffOn = !wordDiffOn;
    await window.electronAPI.appSettings.update({
      diff: { wordDiff: wordDiffOn },
    });
  }

  // ── Line selection (unified only) ──────────────────────────────
  let selectedLines = new SvelteSet<string>();
  let lastClickedLine = $state<string | null>(null);
  let contextMenuPos = $state<{ x: number; y: number } | null>(null);
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
          if (hunk.lines[i].type !== 'context')
            selectedLines.add(lineKey(hunkIdx, i));
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

  // ── Syntax highlight cache ─────────────────────────────────────
  // We highlight each diff line independently (no cross-line context)
  // because we don't have the full file. Imperfect for multi-line
  // strings but fast and good enough for 95% of code.
  let highlightMap = new SvelteMap<DiffLine, string>();

  $effect(() => {
    // React to: diff change, syntax toggle, theme switch.
    const currentDiff = diff;
    const on = syntaxOn;
    const theme = themeStore.resolved;
    if (!currentDiff || currentDiff.binary || !on) {
      untrack(() => highlightMap.clear());
      return;
    }
    const lang = detectLanguage(currentDiff.path);
    if (lang === 'plaintext') {
      untrack(() => highlightMap.clear());
      return;
    }
    let cancelled = false;
    void (async () => {
      const allLines: DiffLine[] = [];
      for (const h of currentDiff.hunks)
        for (const l of h.lines) allLines.push(l);
      // Highlight per line — single-line input means shiki can't see
      // multi-line tokens, but it's fast and parallel-safe.
      const entries = await Promise.all(
        allLines.map(async (line): Promise<[DiffLine, string]> => {
          const html = await highlightLines(line.content, lang as Lang, theme);
          return [line, html[0] ?? line.content];
        }),
      );
      if (cancelled) return;
      highlightMap.clear();
      for (const [line, html] of entries) highlightMap.set(line, html);
    })();
    return () => {
      cancelled = true;
    };
  });

  // ── Word-diff cache ────────────────────────────────────────────
  // Computed lazily per visible row in unified mode (paired in split).
  // For unified mode we walk hunks once and collect the same `-`/`+`
  // pairing logic the split renderer uses, then cache by (hunkIdx, idx).
  type WordDiffSide = 'left' | 'right';
  let wordDiffMap = new SvelteMap<DiffLine, WordSpan[]>();

  $effect(() => {
    const currentDiff = diff;
    const on = wordDiffOn;
    if (!currentDiff || currentDiff.binary || !on) {
      untrack(() => wordDiffMap.clear());
      return;
    }
    untrack(() => wordDiffMap.clear());
    for (const hunk of currentDiff.hunks) {
      // Walk the hunk pairing -/+ runs the same way pairLinesForSplit
      // does, then memoise word-spans for each side.
      let i = 0;
      while (i < hunk.lines.length) {
        if (hunk.lines[i].type === 'context') {
          i++;
          continue;
        }
        const removed: DiffLine[] = [];
        while (i < hunk.lines.length && hunk.lines[i].type === 'removed') {
          removed.push(hunk.lines[i]);
          i++;
        }
        const added: DiffLine[] = [];
        while (i < hunk.lines.length && hunk.lines[i].type === 'added') {
          added.push(hunk.lines[i]);
          i++;
        }
        const pairs = Math.min(removed.length, added.length);
        for (let k = 0; k < pairs; k++) {
          const wd = wordDiffPair(removed[k].content, added[k].content);
          wordDiffMap.set(removed[k], wd.left);
          wordDiffMap.set(added[k], wd.right);
        }
      }
    }
  });

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return c;
      }
    });
  }

  function renderWordSpans(spans: WordSpan[], side: WordDiffSide): string {
    const cls = side === 'left' ? 'word-changed-removed' : 'word-changed-added';
    return spans
      .map((s) =>
        s.kind === 'changed'
          ? `<span class="${cls}">${escapeHtml(s.text)}</span>`
          : escapeHtml(s.text),
      )
      .join('');
  }

  /** Pick the right HTML for a line content cell:
   *   - if word-diff has spans for this line: render those (with side
   *     class) — overrides syntax highlight on this line. v1 trade-off.
   *   - else if syntax highlight has html: render that.
   *   - else escape and return raw text.
   */
  function lineContentHtml(line: DiffLine, side: WordDiffSide): string {
    const wd = wordDiffMap.get(line);
    if (wd) return renderWordSpans(wd, side);
    const sh = highlightMap.get(line);
    if (sh) return sh;
    return escapeHtml(line.content);
  }

  // Side helper for unified mode: removed lines render with left-side
  // word-diff colours, added with right-side.
  function unifiedSide(type: DiffLineType): WordDiffSide {
    return type === 'added' ? 'right' : 'left';
  }

  // ── Split rows derived from current diff ───────────────────────
  let splitRowsByHunk = $derived.by(() => {
    if (!diff || diff.binary) return [];
    return diff.hunks.map((h) => pairLinesForSplit(h));
  });
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
    <div class="diff-toolbar">
      <span class="diff-header diff-path">{diff.path}</span>
      <div class="toolbar-spacer"></div>
      <div class="view-mode" role="group" aria-label="Diff view mode">
        <button
          type="button"
          class:active={viewMode === 'unified'}
          onclick={() => setViewMode('unified')}
          title="Unified view"
          data-testid="diff-view-unified"
        >
          <Rows3 size={12} /> Unified
        </button>
        <button
          type="button"
          class:active={viewMode === 'split'}
          onclick={() => setViewMode('split')}
          title="Side-by-side view"
          data-testid="diff-view-split"
        >
          <Columns2 size={12} /> Split
        </button>
      </div>
      <label class="toggle" title="Apply syntax highlighting">
        <input
          type="checkbox"
          checked={syntaxOn}
          onchange={toggleSyntax}
          data-testid="diff-toggle-syntax"
        />
        Syntax
      </label>
      <label
        class="toggle"
        title="Highlight per-word changes in modification pairs"
      >
        <input
          type="checkbox"
          checked={wordDiffOn}
          onchange={toggleWordDiff}
          data-testid="diff-toggle-word-diff"
        />
        Word
      </label>
    </div>

    <div class="diff-content">
      {#if diff.binary}
        <div class="diff-line"><span class="line-text">Binary file</span></div>
      {:else if viewMode === 'split'}
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
          {#each splitRowsByHunk[hi] ?? [] as row (row.left.originalIndex ?? `r-${row.right.originalIndex}`)}
            {@const leftLine =
              row.left.originalIndex !== null
                ? hunk.lines[row.left.originalIndex]
                : null}
            {@const rightLine =
              row.right.originalIndex !== null
                ? hunk.lines[row.right.originalIndex]
                : null}
            <div class="split-row" data-testid="diff-split-row">
              <div
                class="split-cell {row.left.kind === 'added'
                  ? 'line-added'
                  : row.left.kind === 'removed'
                    ? 'line-removed'
                    : ''}"
              >
                <span class="line-num">{row.left.lineNum ?? ''}</span>
                <span class="line-prefix"
                  >{row.left.kind === 'removed'
                    ? '-'
                    : row.left.kind === 'added'
                      ? '+'
                      : row.left.kind === 'context'
                        ? ' '
                        : ''}</span
                >
                <span class="line-text">
                  {#if leftLine}
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html lineContentHtml(leftLine, 'left')}
                  {/if}
                </span>
              </div>
              <!-- prettier-ignore -->
              <div class="split-cell {row.right.kind === 'added'
                ? 'line-added'
                : row.right.kind === 'removed'
                  ? 'line-removed'
                  : ''}"
              >
                <span class="line-num">{row.right.lineNum ?? ''}</span>
                <span class="line-prefix"
                  >{row.right.kind === 'removed'
                    ? '-'
                    : row.right.kind === 'added'
                      ? '+'
                      : row.right.kind === 'context'
                        ? ' '
                        : ''}</span
                >
                <span class="line-text">
                  {#if rightLine}
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html lineContentHtml(rightLine, 'right')}
                  {/if}
                </span>
              </div>
            </div>
          {/each}
        {/each}
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
              <span class="line-text">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html lineContentHtml(line, unifiedSide(line.type))}
              </span>
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

  .diff-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-toolbar, var(--color-bg-surface));
    font-size: 11px;
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .diff-path {
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .toolbar-spacer {
    flex: 1;
  }

  .view-mode {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .view-mode button {
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    padding: 3px 8px;
    cursor: pointer;
    font-size: 11px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .view-mode button:hover {
    background: var(--color-bg-hover);
  }

  .view-mode button.active {
    background: var(--color-bg-base);
    color: var(--color-text-accent);
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    user-select: none;
  }

  .toggle input {
    accent-color: var(--color-text-accent);
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

  /* Split layout — two columns side-by-side */
  .split-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border-left: 1px solid transparent;
  }

  .split-cell {
    display: flex;
    padding: 0 8px;
    white-space: pre;
    border-right: 1px solid var(--color-border);
    overflow-x: auto;
  }

  .split-cell:last-child {
    border-right: none;
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
    flex: 1;
    min-width: 0;
  }

  /* Word-diff inline highlights — strong tint over the line bg. */
  :global(.word-changed-removed) {
    background: var(--color-diff-deleted, rgba(244, 71, 71, 0.45));
    color: var(--color-text-white, currentColor);
    border-radius: 2px;
  }

  :global(.word-changed-added) {
    background: var(--color-diff-added, rgba(63, 185, 80, 0.45));
    color: var(--color-text-white, currentColor);
    border-radius: 2px;
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
