<script lang="ts">
  type Props = {
    onConfirm: (message: string, keepStaged: boolean) => void;
    onCancel: () => void;
  };

  let { onConfirm, onCancel }: Props = $props();

  let message = $state('');
  let keepStaged = $state(false);

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter') onConfirm(message, keepStaged);
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <p class="description">
      This will stash all the changes in your working copy and return it to a
      clean state.
    </p>

    <div class="field">
      <label class="label" for="stash-msg">Message:</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        id="stash-msg"
        class="input"
        type="text"
        placeholder="Optional"
        bind:value={message}
        autofocus
      />
    </div>

    <label class="checkbox-row">
      <input type="checkbox" bind:checked={keepStaged} />
      Keep staged changes
    </label>

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button class="btn-stash" onclick={() => onConfirm(message, keepStaged)}>
        Stash
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
    width: 420px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .description {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-primary);
    line-height: 1.5;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .label {
    font-size: 13px;
    color: var(--color-text-primary);
    flex-shrink: 0;
  }

  .input {
    flex: 1;
    background: var(--color-bg-base);
    border: 2px solid var(--color-text-accent);
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
    padding-left: 68px;
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

  .btn-stash {
    padding: 6px 24px;
    border: none;
    background: #0e639c;
    color: white;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-stash:hover {
    background: #1177bb;
  }
</style>
