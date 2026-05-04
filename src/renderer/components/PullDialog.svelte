<script lang="ts">
  import { RefreshCw } from '@lucide/svelte';
  import type { Branch, Remote } from '../types';
  import type { PullOptions, PullSettings } from '../../shared/ipc';

  type Props = {
    currentBranch: string | null;
    branches: Branch[];
    remotes: Remote[];
    /** Defaults from `AppSettings.pull` so the dialog opens with the
     *  user's last-used flags pre-selected. */
    defaults: PullSettings;
    onConfirm: (opts: PullOptions) => void;
    onCancel: () => void;
  };

  let {
    currentBranch,
    branches,
    remotes,
    defaults,
    onConfirm,
    onCancel,
  }: Props = $props();

  // Pick a sensible initial remote: the upstream remote of the current
  // branch (e.g. `origin/main` → `origin`), else the first remote, else
  // the empty string when there are none configured yet.
  const currentBranchTracking = currentBranch
    ? (branches.find((b) => b.name === currentBranch)?.tracking ?? null)
    : null;
  function inferDefaultRemote(): string {
    if (currentBranchTracking) {
      const slash = currentBranchTracking.indexOf('/');
      if (slash > 0) return currentBranchTracking.slice(0, slash);
    }
    return remotes[0]?.name ?? '';
  }
  function inferDefaultBranchFor(remote: string): string {
    // If the upstream points at `<remote>/<branch>`, prefer that branch.
    if (currentBranchTracking?.startsWith(`${remote}/`)) {
      return currentBranchTracking.slice(remote.length + 1);
    }
    // Otherwise try matching the local branch name on the remote.
    const r = remotes.find((x) => x.name === remote);
    if (r && currentBranch && r.branches.includes(currentBranch)) {
      return currentBranch;
    }
    return r?.branches[0] ?? '';
  }

  let selectedRemote = $state(inferDefaultRemote());
  let selectedBranch = $state(inferDefaultBranchFor(selectedRemote));

  // Refresh button state (after `git fetch`, the parent re-loads remotes
  // and re-passes them as a prop; we just toggle a spinner during the
  // round-trip).
  let refreshing = $state(false);

  let rebase = $state(defaults.rebase);
  let commit = $state(!defaults.noCommit);
  let noFf = $state(defaults.noFf);
  let log = $state(defaults.log);

  /** Branches available for the currently selected remote. Reactive so a
   *  remote switch updates the dropdown without a manual refetch. */
  let remoteBranches = $derived(
    remotes.find((r) => r.name === selectedRemote)?.branches ?? [],
  );
  /** URL for the currently selected remote, shown read-only under the
   *  remote dropdown to mirror the Sourcetree layout. */
  let remoteUrl = $derived(
    remotes.find((r) => r.name === selectedRemote)?.url ?? '',
  );

  function onRemoteChange() {
    selectedBranch = inferDefaultBranchFor(selectedRemote);
  }

  async function handleRefresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      await window.electronAPI.git.fetch();
      // The toolbar's pull-handler in App.svelte re-fetches sidebar data
      // on `notifyRepoChanged`; that reload propagates new `branches` /
      // `remotes` props to this dialog automatically. Nothing else to do.
    } catch (e) {
      console.error('[pull-dialog] fetch failed', e);
    } finally {
      refreshing = false;
    }
  }

  function handleConfirm() {
    onConfirm({
      remote: selectedRemote || undefined,
      branch: selectedBranch || undefined,
      rebase,
      noCommit: !commit,
      noFf,
      log,
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter') handleConfirm();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3 class="title">Pull</h3>

    <div class="grid">
      <label class="row-label" for="pull-remote">Pull from repository:</label>
      <div class="remote-block">
        <select
          id="pull-remote"
          bind:value={selectedRemote}
          onchange={onRemoteChange}
          data-testid="pull-remote"
        >
          {#each remotes as r (r.name)}
            <option value={r.name}>{r.name}</option>
          {/each}
        </select>
        <input
          class="url"
          type="text"
          value={remoteUrl}
          placeholder="(no URL)"
          readonly
          tabindex={-1}
        />
      </div>

      <label class="row-label" for="pull-branch">Remote branch to pull:</label>
      <div class="branch-row">
        <select
          id="pull-branch"
          bind:value={selectedBranch}
          data-testid="pull-branch"
        >
          {#if remoteBranches.length === 0}
            <option value="">(no branches — try Refresh)</option>
          {/if}
          {#each remoteBranches as b}
            <option value={b}>{b}</option>
          {/each}
        </select>
        <button
          type="button"
          class="refresh"
          onclick={handleRefresh}
          disabled={refreshing}
          title="Fetch from remote to refresh the branch list"
        >
          <span class:spinning={refreshing}><RefreshCw size={12} /></span>
          Refresh
        </button>
      </div>

      <span class="row-label">Pull into local branch:</span>
      <span class="local-branch">{currentBranch ?? '(detached HEAD)'}</span>
    </div>

    <fieldset class="options">
      <legend>Options</legend>
      <label class="opt">
        <input
          type="checkbox"
          bind:checked={commit}
          disabled={rebase}
          data-testid="pull-commit"
        />
        Commit merged changes immediately
      </label>
      <label class="opt">
        <input
          type="checkbox"
          bind:checked={log}
          disabled={rebase}
          data-testid="pull-log"
        />
        Include messages from commits being merged in merge commit
      </label>
      <label class="opt">
        <input
          type="checkbox"
          bind:checked={noFf}
          disabled={rebase}
          data-testid="pull-no-ff"
        />
        Create new commit even if fast-forward merge
      </label>
      <label class="opt">
        <input
          type="checkbox"
          bind:checked={rebase}
          data-testid="pull-rebase"
        />
        Rebase instead of merge
        <span class="warn">
          (WARNING: make sure you haven't pushed your changes)
        </span>
      </label>
    </fieldset>

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button
        class="btn-primary"
        disabled={!selectedRemote || !selectedBranch}
        onclick={handleConfirm}
        data-testid="pull-confirm"
      >
        OK
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
    width: 560px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-white, var(--color-text-primary));
  }

  .grid {
    display: grid;
    grid-template-columns: 170px 1fr;
    gap: 10px 12px;
    align-items: center;
  }

  .row-label {
    font-size: 12px;
    color: var(--color-text-secondary);
    text-align: right;
  }

  .remote-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .branch-row {
    display: flex;
    gap: 6px;
  }

  .branch-row select {
    flex: 1;
  }

  select,
  .url {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .url {
    color: var(--color-text-secondary);
    font-family: monospace;
    font-size: 12px;
  }

  select:focus {
    border-color: var(--color-text-accent);
  }

  .refresh {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    background: var(--color-bg-toolbar);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  .refresh:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }

  .refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinning {
    display: inline-flex;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .local-branch {
    color: var(--color-text-primary);
    font-family: monospace;
    font-size: 12px;
    padding: 4px 0;
  }

  .options {
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 10px 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .options legend {
    padding: 0 6px;
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .opt {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .opt input {
    accent-color: var(--color-text-accent);
  }

  .opt input:disabled + * {
    opacity: 0.5;
  }

  .warn {
    color: var(--color-text-secondary);
    font-style: italic;
    font-size: 11px;
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
    padding: 6px 28px;
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
