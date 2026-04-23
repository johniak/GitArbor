<script lang="ts">
  import type { Branch, Remote } from '../types';

  export type PushAction = {
    remote: string;
    branches: Array<{ local: string; remote: string; setUpstream: boolean }>;
    includeTags: boolean;
  };

  type Props = {
    branches: Branch[];
    remotes: Remote[];
    onConfirm: (action: PushAction) => void;
    onCancel: () => void;
  };

  let { branches, remotes, onConfirm, onCancel }: Props = $props();

  let selectedRemote = $state<string>(
    remotes.find((r) => r.name === 'origin')?.name ?? remotes[0]?.name ?? '',
  );

  // Strip the remote-name prefix off a tracking ref, leaving just the branch
  // name (so "origin/feature/x" → "feature/x").
  function stripRemotePrefix(tracking: string | null, remote: string): string {
    if (!tracking) return '';
    const prefix = `${remote}/`;
    return tracking.startsWith(prefix)
      ? tracking.slice(prefix.length)
      : tracking;
  }

  type Row = {
    local: string;
    remote: string;
    tracking: string | null;
    push: boolean;
    setUpstream: boolean;
    ahead: number;
    behind: number;
  };

  let rows = $state<Row[]>(
    branches.map((b) => {
      const remoteName =
        stripRemotePrefix(b.tracking, selectedRemote) || b.name;
      const preCheck = b.current && b.ahead > 0;
      return {
        local: b.name,
        remote: remoteName,
        tracking: b.tracking,
        push: preCheck,
        setUpstream: preCheck && !b.tracking,
        ahead: b.ahead,
        behind: b.behind,
      };
    }),
  );

  let pushAllTags = $state(false);

  let selectAllChecked = $derived(rows.length > 0 && rows.every((r) => r.push));

  let anyPush = $derived(rows.some((r) => r.push));
  let canSubmit = $derived(
    selectedRemote.length > 0 && (anyPush || pushAllTags),
  );

  let remoteUrl = $derived(
    remotes.find((r) => r.name === selectedRemote)?.url ?? '',
  );

  function toggleSelectAll(checked: boolean) {
    rows = rows.map((r) => ({
      ...r,
      push: checked,
      setUpstream:
        checked && !r.tracking ? true : !checked ? false : r.setUpstream,
    }));
  }

  function togglePush(index: number, checked: boolean) {
    const r = rows[index];
    rows[index] = {
      ...r,
      push: checked,
      // Auto-enable setUpstream for newly-checked unrelated branches
      setUpstream:
        checked && !r.tracking ? true : !checked ? false : r.setUpstream,
    };
  }

  function toggleTrack(index: number, checked: boolean) {
    rows[index] = { ...rows[index], setUpstream: checked };
  }

  function handleConfirm() {
    if (!canSubmit) return;
    onConfirm({
      remote: selectedRemote,
      branches: rows
        .filter((r) => r.push)
        .map((r) => ({
          local: r.local,
          remote: r.remote,
          setUpstream: r.setUpstream,
        })),
      includeTags: pushAllTags,
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3 class="title">Push</h3>

    <div class="remote-row">
      <label class="field-label" for="push-remote">Push to repository:</label>
      <select
        id="push-remote"
        class="select"
        bind:value={selectedRemote}
        data-testid="push-remote-select"
      >
        {#each remotes as r}
          <option value={r.name}>{r.name}</option>
        {/each}
      </select>
      <input
        class="input url-input"
        type="text"
        readonly
        value={remoteUrl}
        data-testid="push-remote-url"
      />
    </div>

    <div class="branches-block">
      <span class="field-label">Branches to push</span>
      <div class="table" data-testid="push-branches-table">
        <div class="th row">
          <div class="col-check">
            <input
              type="checkbox"
              checked={selectAllChecked}
              data-testid="push-select-all"
              onchange={(e) =>
                toggleSelectAll((e.currentTarget as HTMLInputElement).checked)}
            />
          </div>
          <div class="col-local">Local branch</div>
          <div class="col-remote">Remote branch</div>
          <div class="col-track">Track?</div>
        </div>
        {#if rows.length === 0}
          <div class="empty">No local branches to push.</div>
        {:else}
          {#each rows as r, i}
            <div
              class="row"
              class:current={branches[i]?.current}
              data-testid="push-row-{r.local}"
            >
              <div class="col-check">
                <input
                  type="checkbox"
                  checked={r.push}
                  data-testid="push-row-check-{r.local}"
                  onchange={(e) =>
                    togglePush(
                      i,
                      (e.currentTarget as HTMLInputElement).checked,
                    )}
                />
              </div>
              <div class="col-local" title={r.local}>
                {r.local}
                {#if r.ahead > 0}
                  <span class="badge ahead">↑{r.ahead}</span>
                {/if}
                {#if r.behind > 0}
                  <span class="badge behind">↓{r.behind}</span>
                {/if}
              </div>
              <div class="col-remote" title={r.remote}>{r.remote}</div>
              <div class="col-track">
                {#if !r.tracking}
                  <input
                    type="checkbox"
                    checked={r.setUpstream}
                    disabled={!r.push}
                    title="Set this branch to track the remote branch after push"
                    data-testid="push-row-track-{r.local}"
                    onchange={(e) =>
                      toggleTrack(
                        i,
                        (e.currentTarget as HTMLInputElement).checked,
                      )}
                  />
                {:else}
                  <span
                    class="tracks-already"
                    title="Already tracks {r.tracking}">✓</span
                  >
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <label class="checkbox-row">
      <input
        type="checkbox"
        bind:checked={pushAllTags}
        data-testid="push-all-tags"
      />
      Push all tags
    </label>

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button
        class="btn-primary"
        disabled={!canSubmit}
        data-testid="push-submit"
        onclick={handleConfirm}
      >
        Push
      </button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .dialog {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 20px;
    width: 640px;
    max-width: 95vw;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-white);
  }

  .field-label {
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .remote-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .select {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
    min-width: 120px;
  }

  .input {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 12px;
    outline: none;
  }

  .url-input {
    flex: 1;
    cursor: default;
    opacity: 0.7;
  }

  .branches-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .table {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    max-height: 300px;
    overflow-y: auto;
    background: var(--color-bg-base);
  }

  .row {
    display: grid;
    grid-template-columns: 40px 1fr 1fr 70px;
    align-items: center;
    padding: 4px 8px;
    gap: 8px;
    font-size: 12px;
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border);
  }

  .row:last-child {
    border-bottom: none;
  }

  .row.current {
    background: color-mix(in srgb, var(--color-bg-selected) 40%, transparent);
  }

  .th {
    background: var(--color-bg-surface);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary);
    position: sticky;
    top: 0;
  }

  .col-check,
  .col-track {
    display: flex;
    justify-content: center;
  }

  .col-local,
  .col-remote {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .badge {
    font-size: 9px;
    padding: 0 4px;
    border-radius: 3px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-surface);
  }

  .ahead {
    color: #6aa84f;
  }

  .behind {
    color: #d16a6a;
  }

  .tracks-already {
    color: var(--color-text-secondary);
    font-size: 11px;
  }

  .empty {
    padding: 12px;
    font-size: 12px;
    color: var(--color-text-secondary);
    text-align: center;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .checkbox-row input {
    accent-color: var(--color-text-accent);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .btn-cancel {
    padding: 6px 24px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-toolbar);
    color: var(--color-text-primary);
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: var(--color-bg-hover);
  }

  .btn-primary {
    padding: 6px 24px;
    border: none;
    background: #0e639c;
    color: white;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-primary:hover {
    background: #1177bb;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
