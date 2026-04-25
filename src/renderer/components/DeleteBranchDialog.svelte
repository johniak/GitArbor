<script lang="ts">
  type Props = {
    branch: string;
    onConfirm: (force: boolean) => void;
    onCancel: () => void;
  };

  let { branch, onConfirm, onCancel }: Props = $props();

  let force = $state(false);

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(force);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3 class="title">Delete branch?</h3>
    <p class="body">
      Removes the local branch <code class="branch">{branch}</code>. By default
      git refuses to delete branches that aren't merged into upstream/HEAD.
    </p>

    <label class="force-row">
      <input
        type="checkbox"
        bind:checked={force}
        data-testid="delete-branch-force"
      />
      <span>Force delete (discard unmerged commits — uses <code>-D</code>)</span
      >
    </label>

    {#if force}
      <p class="warning">
        ⚠ Force delete will lose any commits unique to this branch unless
        they're reachable from another ref.
      </p>
    {/if}

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button
        class="btn-danger"
        data-testid="delete-branch-submit"
        onclick={() => onConfirm(force)}
      >
        Delete
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

  .branch {
    font-family: monospace;
    font-size: 12px;
    color: var(--color-text-primary);
    background: var(--color-bg-base);
    padding: 2px 5px;
    border-radius: 3px;
    border: 1px solid var(--color-border);
  }

  .force-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12px;
    color: var(--color-text-primary);
    cursor: pointer;
    line-height: 1.4;
  }

  .force-row code {
    font-family: monospace;
    background: var(--color-bg-base);
    padding: 1px 4px;
    border-radius: 3px;
    border: 1px solid var(--color-border);
  }

  .warning {
    margin: 0;
    font-size: 11px;
    color: var(--color-diff-deleted);
    line-height: 1.4;
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

  .btn-danger {
    padding: 6px 24px;
    border: none;
    background: var(--color-diff-deleted);
    color: white;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-danger:hover {
    filter: brightness(1.1);
  }
</style>
