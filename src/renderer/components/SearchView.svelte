<script lang="ts">
  import { Search } from '@lucide/svelte';
  import type { Commit } from '../types';
  import type { SearchMode } from '../../shared/ipc';

  type Props = {
    selectedHash?: string | null;
    onSelect?: (commit: Commit) => void;
  };

  let { selectedHash = null, onSelect }: Props = $props();

  let query = $state('');
  let mode = $state<SearchMode>('message');
  let fromDate = $state('');
  let untilDate = $state('');
  let results = $state<Commit[]>([]);
  let searching = $state(false);
  let lastError = $state<string | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleSearch() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 300);
  }

  async function runSearch() {
    debounceTimer = null;
    if (!query.trim()) {
      results = [];
      lastError = null;
      return;
    }
    searching = true;
    lastError = null;
    try {
      results = await window.electronAPI.git.searchCommits({
        query,
        mode,
        since: fromDate || undefined,
        until: untilDate || undefined,
      });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      results = [];
    } finally {
      searching = false;
    }
  }

  function selectRow(commit: Commit) {
    onSelect?.(commit);
  }

  function fmtDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  }
</script>

<div class="search-view">
  <div class="search-bar">
    <div class="query-wrap">
      <Search size={14} strokeWidth={1.8} />
      <input
        class="query"
        type="text"
        placeholder="Enter a string to search for"
        bind:value={query}
        oninput={scheduleSearch}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (debounceTimer) clearTimeout(debounceTimer);
            void runSearch();
          }
        }}
        data-testid="search-query"
      />
    </div>
    <label class="field">
      <span class="label">Search:</span>
      <select
        bind:value={mode}
        onchange={scheduleSearch}
        data-testid="search-mode"
      >
        <option value="message">Commit Message</option>
        <option value="author">Author</option>
        <option value="sha">SHA</option>
        <option value="file-content">File Content</option>
      </select>
    </label>
    <label class="field">
      <span class="label">From:</span>
      <input
        type="date"
        bind:value={fromDate}
        onchange={scheduleSearch}
        data-testid="search-from"
      />
    </label>
    <label class="field">
      <span class="label">To:</span>
      <input
        type="date"
        bind:value={untilDate}
        onchange={scheduleSearch}
        data-testid="search-until"
      />
    </label>
  </div>

  <div class="results">
    <div class="row header">
      <div class="cell description">Description</div>
      <div class="cell hash">Commit</div>
      <div class="cell author">Author</div>
      <div class="cell date">Date</div>
    </div>

    {#if lastError}
      <div class="empty-state">{lastError}</div>
    {:else if !query.trim()}
      <div class="empty-state">
        Type to search across all branches, remotes, and tags.
      </div>
    {:else if searching}
      <div class="empty-state">Searching…</div>
    {:else if results.length === 0}
      <div class="empty-state">No commits match.</div>
    {:else}
      <div class="row-list" data-testid="search-results">
        {#each results as commit (commit.hash)}
          <button
            type="button"
            class="row data"
            class:selected={selectedHash === commit.hashShort}
            onclick={() => selectRow(commit)}
            data-testid="search-result-row"
          >
            <div class="cell description">{commit.message}</div>
            <div class="cell hash">{commit.hashShort}</div>
            <div class="cell author">{commit.authorName}</div>
            <div class="cell date">{fmtDate(commit.date)}</div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .search-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--color-bg-base);
  }

  .search-bar {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-bg-toolbar);
    border-bottom: 1px solid var(--color-border);
    align-items: center;
    flex-shrink: 0;
  }

  .query-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 4px 8px;
    color: var(--color-text-secondary);
  }

  .query-wrap:focus-within {
    border-color: var(--color-text-accent);
  }

  .query {
    flex: 1;
    border: none;
    background: none;
    color: var(--color-text-primary);
    font-size: 12px;
    outline: none;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .field .label {
    user-select: none;
  }

  .field select,
  .field input[type='date'] {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: 3px;
    padding: 3px 6px;
    font-size: 11px;
  }

  .results {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 90px 160px 170px;
    gap: 8px;
    padding: 4px 12px;
    align-items: center;
    font-size: 12px;
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border);
  }

  .row.header {
    background: var(--color-bg-toolbar);
    color: var(--color-text-secondary);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .row.data {
    background: none;
    border: none;
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    cursor: pointer;
    width: 100%;
  }

  .row.data:hover {
    background: var(--color-bg-hover);
  }

  .row.data.selected {
    background: var(--color-bg-selected);
    color: var(--color-text-white);
  }

  .cell {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell.hash {
    font-family: monospace;
    color: var(--color-text-accent-light);
  }

  .row.data.selected .cell.hash {
    color: var(--color-text-white);
  }

  .cell.author,
  .cell.date {
    color: var(--color-text-secondary);
    font-size: 11px;
  }

  .row.data.selected .cell.author,
  .row.data.selected .cell.date {
    color: var(--color-text-white);
  }

  .empty-state {
    padding: 32px 16px;
    color: var(--color-text-secondary);
    text-align: center;
    font-size: 12px;
  }

  .row-list {
    display: flex;
    flex-direction: column;
  }
</style>
