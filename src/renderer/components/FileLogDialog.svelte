<script lang="ts">
  import { onMount } from 'svelte';
  import DiffViewer from './DiffViewer.svelte';
  import CommitInfoPanel from './CommitInfoPanel.svelte';
  import type { Commit, FileDiff } from '../types';

  type Props = {
    path: string;
    /** Hash to pre-select after the list loads (used by Annotate's
     *  "click changeset → open file log on this commit"). */
    initialHash?: string;
    /** Commit ref to start `git log` from. Defaults to HEAD when omitted. */
    ref?: string;
    onCancel: () => void;
  };

  let { path, initialHash, ref, onCancel }: Props = $props();

  let commits = $state<Commit[]>([]);
  let selectedHash = $state<string | null>(null);
  let selectedDiff = $state<FileDiff | null>(null);
  let selectedBody = $state('');
  // When opened from Annotate (initialHash present) follow renames by
  // default so the clicked commit — which may pre-date a rename — is
  // included in the listing.
  let followRenames = $state(initialHash !== undefined);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  let selectedCommit = $derived(
    commits.find((c) => c.hash === selectedHash) ?? null,
  );

  async function load() {
    loading = true;
    loadError = null;
    try {
      commits = await window.electronAPI.git.getFileHistory(path, {
        followRenames,
        ref,
      });
      // Pick initial selection: caller-provided hash (if present in
      // the result) wins, otherwise the newest entry.
      if (initialHash && commits.some((c) => c.hash === initialHash)) {
        selectedHash = initialHash;
      } else if (commits.length > 0) {
        selectedHash = commits[0].hash;
      } else {
        selectedHash = null;
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      commits = [];
      selectedHash = null;
    } finally {
      loading = false;
    }
  }

  // Refetch when "Follow renames" flips.
  $effect(() => {
    void followRenames;
    void load();
  });

  // When selection changes, fetch its file-diff + body.
  $effect(() => {
    const hash = selectedHash;
    if (!hash) {
      selectedDiff = null;
      selectedBody = '';
      return;
    }
    void (async () => {
      try {
        const [diff, body] = await Promise.all([
          window.electronAPI.git.getFileDiff(hash, path),
          window.electronAPI.git.getCommitBody(hash),
        ]);
        if (selectedHash !== hash) return; // stale response
        selectedDiff = diff;
        selectedBody = body;
      } catch (e) {
        console.error('[file-log] selection load failed:', e);
      }
    })();
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  function fmtDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString();
  }

  onMount(() => {
    // load() runs via the $effect on followRenames already.
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div
    class="dialog"
    onclick={(e) => e.stopPropagation()}
    data-testid="file-log-dialog"
  >
    <h3 class="title" data-testid="file-log-title">
      Log: <code>{path}</code>
    </h3>

    <div class="split">
      <div class="commits">
        <div class="thead">
          <span class="col-changeset">Changeset</span>
          <span class="col-date">Date</span>
          <span class="col-user">User</span>
          <span class="col-description">Description</span>
        </div>
        <div class="tbody">
          {#if loading}
            <div class="placeholder">Loading…</div>
          {:else if loadError}
            <div class="placeholder error">{loadError}</div>
          {:else if commits.length === 0}
            <div class="placeholder" data-testid="file-log-empty">
              No history
            </div>
          {:else}
            {#each commits as commit (commit.hash)}
              <div
                class="trow"
                class:selected={selectedHash === commit.hash}
                onclick={() => (selectedHash = commit.hash)}
                role="button"
                tabindex="0"
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectedHash = commit.hash;
                  }
                }}
                data-testid="file-log-row"
                data-hash={commit.hash}
              >
                <span class="col-changeset"
                  ><code>{commit.hashShort}</code></span
                >
                <span class="col-date">{fmtDate(commit.date)}</span>
                <span class="col-user">{commit.authorName}</span>
                <span class="col-description">{commit.message}</span>
              </div>
            {/each}
          {/if}
        </div>
      </div>

      <div class="diff" data-testid="file-log-diff">
        <DiffViewer diff={selectedDiff} />
      </div>
    </div>

    {#if selectedCommit}
      <div class="info-wrap">
        <CommitInfoPanel commit={selectedCommit} body={selectedBody} />
      </div>
    {/if}

    <div class="footer">
      <label class="follow">
        <input
          type="checkbox"
          bind:checked={followRenames}
          data-testid="file-log-follow-renames"
        />
        Follow renamed files
      </label>
      <div class="spacer"></div>
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
    height: min(760px, 90vh);
    display: flex;
    flex-direction: column;
    gap: 10px;
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

  .split {
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: minmax(360px, 45%) 1fr;
    gap: 8px;
    min-height: 0;
  }

  .commits {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-bg-base);
    overflow: hidden;
  }

  .thead,
  .trow {
    display: grid;
    grid-template-columns: 90px 96px 130px 1fr;
    gap: 8px;
    align-items: center;
    padding: 4px 10px;
    font-size: 11px;
  }

  .thead {
    flex: 0 0 auto;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-toolbar);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.04em;
  }

  .tbody {
    flex: 1 1 auto;
    overflow-y: auto;
  }

  .trow {
    cursor: pointer;
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border);
  }

  .trow:hover {
    background: var(--color-bg-hover);
  }

  .trow.selected {
    background: var(--color-bg-selected);
    color: var(--color-text-white);
  }

  .col-changeset code {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    color: inherit;
    background: none;
    padding: 0;
    border: none;
  }

  .col-description {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-date,
  .col-user {
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trow.selected .col-date,
  .trow.selected .col-user {
    color: var(--color-text-primary);
  }

  .diff {
    border: 1px solid var(--color-border);
    border-radius: 4px;
    overflow: hidden;
    min-width: 0;
  }

  .info-wrap {
    flex: 0 0 auto;
    max-height: 200px;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
  }

  .placeholder {
    padding: 16px;
    color: var(--color-text-secondary);
    font-size: 12px;
  }

  .placeholder.error {
    color: var(--color-diff-deleted);
  }

  .footer {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .follow {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .follow input {
    accent-color: var(--color-text-accent);
  }

  .spacer {
    flex: 1 1 auto;
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
