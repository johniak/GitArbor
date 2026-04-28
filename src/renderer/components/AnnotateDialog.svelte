<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import VirtualList from '@humanspeak/svelte-virtual-list';
  import CodeLine from './CodeLine.svelte';
  import type { BlameLine } from '../../shared/blame-parser';
  import { detectLanguage, highlightLines } from '../lib/syntax-highlight';
  import { themeStore } from '../theme-store.svelte';

  type Props = {
    path: string;
    /** Commit ref to blame at. Defaults to HEAD when omitted. */
    ref?: string;
    onCancel: () => void;
    onOpenFileLog?: (path: string, hash: string) => void;
  };

  let { path, ref, onCancel, onOpenFileLog }: Props = $props();

  let lines = $state<BlameLine[]>([]);
  let html = $state<string[]>([]);
  let loadError = $state<string | null>(null);
  let loading = $state(true);

  const lang = detectLanguage(path);

  // Per-sha colour bands. Picks from a fixed palette so two adjacent
  // commits never share a colour. Same sha → same colour.
  const BAND_PALETTE = [
    '#5b9bd5',
    '#e2a04f',
    '#9cdcfe',
    '#c586c0',
    '#4ec9b0',
    '#dcdcaa',
    '#d7ba7d',
    '#569cd6',
  ];
  let bandColors = $derived.by(() => {
    const map = new SvelteMap<string, string>();
    let next = 0;
    for (const l of lines) {
      if (!map.has(l.hash)) {
        map.set(l.hash, BAND_PALETTE[next % BAND_PALETTE.length]);
        next += 1;
      }
    }
    return map;
  });

  // Flag the first row of each contiguous sha-group so it gets a top border.
  let groupStarts = $derived.by(() => {
    const out = new SvelteSet<number>();
    let prev: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].hash !== prev) out.add(i);
      prev = lines[i].hash;
    }
    return out;
  });

  async function load() {
    loading = true;
    loadError = null;
    try {
      const blame = await window.electronAPI.git.getBlame(path, ref);
      lines = blame;
      // Reconstruct content from blame (preserves the exact lines git saw).
      const content = blame.map((b) => b.content).join('\n');
      html = await highlightLines(content, lang, themeStore.resolved);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  // Re-highlight when the resolved theme flips. Pure re-tokenise: blame
  // call is cached above, no need to refetch.
  $effect(() => {
    const resolved = themeStore.resolved;
    if (lines.length === 0) return;
    const content = lines.map((b) => b.content).join('\n');
    void (async () => {
      html = await highlightLines(content, lang, resolved);
    })();
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  onMount(() => {
    void load();
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div
    class="dialog"
    onclick={(e) => e.stopPropagation()}
    data-testid="annotate-dialog"
  >
    <h3 class="title" data-testid="annotate-title">
      Annotations for <code>{path}</code>
    </h3>

    <div class="header">
      <span class="col-line">Line</span>
      <span class="col-author">Author</span>
      <span class="col-changeset">Changeset</span>
      <span class="col-content">Content</span>
    </div>

    <div class="body">
      {#if loading}
        <div class="placeholder">Loading…</div>
      {:else if loadError}
        <div class="placeholder error">{loadError}</div>
      {:else if lines.length === 0}
        <div class="placeholder" data-testid="annotate-empty">Empty file</div>
      {:else}
        <VirtualList
          items={lines}
          defaultEstimatedItemHeight={20}
          bufferSize={20}
        >
          {#snippet renderItem(line: BlameLine, index: number)}
            <CodeLine
              {line}
              htmlContent={html[index] ?? ''}
              isGroupStart={groupStarts.has(index)}
              bandColor={bandColors.get(line.hash) ?? 'transparent'}
              onChangesetClick={() => onOpenFileLog?.(path, line.hash)}
            />
          {/snippet}
        </VirtualList>
      {/if}
    </div>

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Close</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .dialog {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 16px;
    width: min(1100px, 94vw);
    height: min(720px, 88vh);
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-white);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title code {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    background: var(--color-bg-base);
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid var(--color-border);
    font-size: 11px;
    color: var(--color-text-primary);
  }

  .header {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: 60px 180px 90px 1fr;
    gap: 12px;
    padding: 6px 8px 6px 12px;
    border-top: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-toolbar);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-secondary);
  }

  .col-line {
    text-align: right;
  }

  .body {
    flex: 1 1 auto;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg-base);
    overflow: hidden;
    min-height: 0;
  }

  .placeholder {
    padding: 16px;
    color: var(--color-text-secondary);
    font-size: 12px;
  }

  .placeholder.error {
    color: var(--color-diff-deleted);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn-cancel {
    padding: 6px 24px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-toolbar);
    color: var(--color-text-primary);
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: var(--color-bg-hover);
  }
</style>
