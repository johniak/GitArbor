<script lang="ts">
  import { AlertTriangle } from '@lucide/svelte';
  import type { Worktree } from '../../shared/ipc';

  type Props = {
    worktree: Worktree;
    onConfirm: (force: boolean) => void;
    onCancel: () => void;
  };

  let { worktree, onConfirm, onCancel }: Props = $props();

  let needsForce = $derived(
    Boolean(worktree.dirty) || Boolean(worktree.locked),
  );
  let forceChecked = $state(false);
  let canRemove = $derived(!needsForce || forceChecked);

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter' && canRemove) onConfirm(needsForce);
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3 class="title">Remove Worktree</h3>

    <p class="path"><code>{worktree.path}</code></p>

    {#if needsForce}
      <div class="warn">
        <AlertTriangle size={16} />
        <div>
          {#if worktree.dirty && worktree.locked}
            <strong>Worktree is locked AND has uncommitted changes.</strong>
          {:else if worktree.dirty}
            <strong>Worktree has uncommitted changes that will be lost.</strong>
          {:else if worktree.locked}
            <strong>Worktree is locked.</strong>
          {/if}
          <div class="hint">
            Force-removing will discard pending work and ignore the lock.
          </div>
        </div>
      </div>

      <label class="checkbox-row">
        <input
          type="checkbox"
          bind:checked={forceChecked}
          data-testid="worktree-remove-force"
        />
        Yes, force remove
      </label>
    {:else}
      <p class="info">
        The folder will be deleted from disk but the branch remains intact.
      </p>
    {/if}

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button
        class="btn-danger"
        disabled={!canRemove}
        onclick={() => onConfirm(needsForce)}
        data-testid="worktree-remove-confirm"
      >
        Remove
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
    width: 440px;
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

  .path code {
    background: var(--color-bg-base);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    word-break: break-all;
    display: inline-block;
  }

  .warn {
    display: flex;
    gap: 10px;
    padding: 10px 12px;
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font-size: 12px;
    color: var(--color-text-primary);
    align-items: flex-start;
  }

  .hint {
    margin-top: 4px;
    color: var(--color-text-secondary);
  }

  .info {
    font-size: 12px;
    color: var(--color-text-secondary);
    margin: 0;
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

  .btn-danger {
    padding: 6px 24px;
    border: none;
    background: #c0392b;
    color: white;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-danger:hover {
    background: #d44535;
  }

  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
