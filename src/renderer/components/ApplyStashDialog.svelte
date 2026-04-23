<script lang="ts">
  type Props = {
    stashMessage: string;
    onConfirm: (deleteAfter: boolean) => void;
    onCancel: () => void;
  };

  let { stashMessage, onConfirm, onCancel }: Props = $props();

  let deleteAfter = $state(false);

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter') onConfirm(deleteAfter);
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3 class="title">Apply Stash?</h3>
    <p class="description">
      Are you sure you want to apply the stash '{stashMessage}' to your working
      copy? This may cause merge conflicts if files were modified.
    </p>

    <label class="checkbox-row">
      <input type="checkbox" bind:checked={deleteAfter} />
      Delete after applying
    </label>

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button class="btn-ok" onclick={() => onConfirm(deleteAfter)}>OK</button>
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
    width: 380px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-white);
  }

  .description {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-primary);
    line-height: 1.5;
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
    gap: 8px;
    margin-top: 4px;
  }

  .btn-cancel {
    flex: 1;
    padding: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-toolbar);
    color: var(--color-text-primary);
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: var(--color-bg-hover);
  }

  .btn-ok {
    flex: 1;
    padding: 8px;
    border: none;
    background: #0e639c;
    color: white;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-ok:hover {
    background: #1177bb;
  }
</style>
