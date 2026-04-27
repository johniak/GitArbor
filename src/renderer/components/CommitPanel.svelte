<script lang="ts">
  import { onMount } from 'svelte';
  import { settingsStore } from '../settings-store.svelte';

  type Props = {
    currentBranch?: string | null;
    stagingMode?: 'split' | 'fluid' | 'none';
    onCommit?: (
      message: string,
      amend: boolean,
      push: boolean,
      noVerify: boolean,
    ) => void;
    onCancel?: () => void;
  };

  let {
    currentBranch = null,
    stagingMode = 'split',
    onCommit,
    onCancel,
  }: Props = $props();

  const STAGING_HINT: Record<NonNullable<Props['stagingMode']>, string> = {
    split: '',
    fluid: 'Fluid: tick the files to include',
    none: 'No staging: all changes will be committed',
  };

  let message = $state('');
  let amend = $state(false);
  let pushAfterCommit = $derived(settingsStore.settings.commit.pushAfterCommit);
  let noVerify = $derived(settingsStore.settings.commit.noVerify);
  let authorName = $state('');
  let authorEmail = $state('');

  onMount(async () => {
    const stored = settingsStore.settings.commit;
    if (stored.authorName) {
      authorName = stored.authorName;
    }
    if (stored.authorEmail) {
      authorEmail = stored.authorEmail;
    }
    if (!authorName || !authorEmail) {
      try {
        if (!authorName) {
          authorName = await window.electronAPI.git.getConfig('user.name');
        }
        if (!authorEmail) {
          authorEmail = await window.electronAPI.git.getConfig('user.email');
        }
      } catch {
        // ignore
      }
    }
  });

  function handleCommit() {
    if (!message.trim()) return;
    onCommit?.(message, amend, pushAfterCommit, noVerify);
    message = '';
  }
</script>

<div class="commit-panel">
  <div class="author-row">
    <span class="author">
      {authorName}
      {#if authorEmail}<span class="email">&lt;{authorEmail}&gt;</span>{/if}
    </span>
    {#if STAGING_HINT[stagingMode]}
      <span class="staging-hint" data-testid="staging-hint"
        >{STAGING_HINT[stagingMode]}</span
      >
    {/if}
  </div>

  <textarea
    class="commit-message"
    placeholder="Commit message..."
    bind:value={message}
    rows={4}
  ></textarea>

  <div class="actions-row">
    <label class="option">
      <input
        type="checkbox"
        checked={pushAfterCommit}
        onchange={(e) =>
          settingsStore.update({
            commit: {
              pushAfterCommit: (e.currentTarget as HTMLInputElement).checked,
            },
          })}
      />
      Push changes immediately to origin{currentBranch
        ? `/${currentBranch}`
        : ''}
    </label>
    <label class="option">
      <input type="checkbox" bind:checked={amend} />
      Amend last commit
    </label>
    <label class="option">
      <input
        type="checkbox"
        checked={noVerify}
        onchange={(e) =>
          settingsStore.update({
            commit: {
              noVerify: (e.currentTarget as HTMLInputElement).checked,
            },
          })}
      />
      Bypass commit hooks
    </label>
    <div class="actions-buttons">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button
        class="btn-commit"
        disabled={!message.trim()}
        onclick={handleCommit}
      >
        Commit
      </button>
    </div>
  </div>
</div>

<style>
  .commit-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-surface);
    flex-shrink: 0;
  }

  .author-row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .staging-hint {
    font-size: 10px;
    padding: 2px 8px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-secondary);
    background: var(--color-bg-base);
  }

  .author {
    color: var(--color-text-primary);
  }

  .email {
    color: var(--color-text-secondary);
  }

  .commit-message {
    width: 100%;
    box-sizing: border-box;
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 8px;
    border-radius: 4px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
    resize: vertical;
    outline: none;
  }

  .commit-message:focus {
    border-color: var(--color-text-accent);
  }

  .actions-row {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .option {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .option input {
    accent-color: var(--color-text-accent);
  }

  .actions-buttons {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  .btn-cancel {
    padding: 4px 16px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-toolbar);
    color: var(--color-text-primary);
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: var(--color-bg-hover);
  }

  .btn-commit {
    padding: 4px 16px;
    border: none;
    background: #0e639c;
    color: white;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .btn-commit:hover {
    background: #1177bb;
  }

  .btn-commit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
