<script lang="ts">
  import type { Remote } from '../types';

  type Props = {
    shortHash: string;
    remotes: Remote[];
    defaultBranch: string;
    onConfirm: (opts: {
      remote: string;
      branch: string;
      force: boolean;
    }) => void;
    onCancel: () => void;
  };

  let { shortHash, remotes, defaultBranch, onConfirm, onCancel }: Props =
    $props();

  let remote = $state<string>(
    remotes.find((r) => r.name === 'origin')?.name ?? remotes[0]?.name ?? '',
  );
  let branch = $state<string>(defaultBranch);
  let force = $state(false);

  let valid = $derived(remote.length > 0 && branch.trim().length > 0);

  function handleConfirm() {
    if (!valid) return;
    onConfirm({ remote, branch: branch.trim(), force });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter') {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT') {
        e.preventDefault();
        handleConfirm();
      }
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3 class="title">Push revision</h3>
    <p class="body">
      Update
      <code class="commit-hash">{shortHash}</code>
      on a remote branch by pushing this exact revision.
    </p>

    <div class="field">
      <label class="field-label" for="push-rev-remote">Remote:</label>
      <select id="push-rev-remote" class="select" bind:value={remote}>
        {#each remotes as r}
          <option value={r.name}>{r.name}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label class="field-label" for="push-rev-branch">Branch:</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        id="push-rev-branch"
        class="input"
        type="text"
        bind:value={branch}
        data-testid="push-revision-branch"
        autofocus
      />
    </div>

    <label class="checkbox-row">
      <input
        type="checkbox"
        bind:checked={force}
        data-testid="push-revision-force"
      />
      Force push (with lease)
    </label>
    {#if force}
      <p class="warn">
        Required only if the remote has commits not in this revision's history.
      </p>
    {/if}

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button
        class="btn-primary"
        disabled={!valid}
        data-testid="push-revision-submit"
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
    width: 460px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-white);
  }

  .body {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-primary);
    line-height: 1.5;
  }

  .commit-hash {
    font-family: monospace;
    font-size: 12px;
    color: var(--color-text-primary);
    background: var(--color-bg-base);
    padding: 2px 5px;
    border-radius: 3px;
    border: 1px solid var(--color-border);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label {
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .input {
    background: var(--color-bg-base);
    border: 2px solid var(--color-text-accent);
    color: var(--color-text-primary);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
  }

  .select {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
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

  .warn {
    margin: 0;
    font-size: 11px;
    color: var(--color-text-secondary);
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
