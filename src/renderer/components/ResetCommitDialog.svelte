<script lang="ts">
  export type ResetMode = 'soft' | 'mixed' | 'hard';

  type Props = {
    branch: string;
    shortHash: string;
    subject: string;
    onConfirm: (mode: ResetMode) => void;
    onCancel: () => void;
  };

  let { branch, shortHash, subject, onConfirm, onCancel }: Props = $props();

  let mode = $state<ResetMode>('mixed');

  function handleConfirm() {
    onConfirm(mode);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter') {
      const target = e.target as HTMLElement | null;
      if (target?.tagName !== 'SELECT') {
        e.preventDefault();
        handleConfirm();
      }
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3 class="title">Are you sure you want to move the branch pointer?</h3>

    <div class="grid">
      <span class="grid-label">Reset branch:</span>
      <span class="grid-value">{branch}</span>

      <span class="grid-label">To commit:</span>
      <span class="grid-value">
        <code class="commit-hash">{shortHash}</code>
        <span class="commit-subject">{subject}</span>
      </span>

      <span class="grid-label">Using mode:</span>
      <select class="select" bind:value={mode} data-testid="reset-mode">
        <option value="soft">Soft – keep working copy and index</option>
        <option value="mixed">Mixed – keep working copy but reset index</option>
        <option value="hard">Hard – discard working copy and index</option>
      </select>
    </div>

    {#if mode === 'hard'}
      <p class="warn">Local changes will be lost.</p>
    {/if}

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button
        class="btn-primary"
        data-testid="reset-submit"
        onclick={handleConfirm}
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
    width: 480px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-white);
  }

  .grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px 12px;
    align-items: center;
  }

  .grid-label {
    font-size: 12px;
    color: var(--color-text-secondary);
    justify-self: end;
  }

  .grid-value {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text-primary);
  }

  .commit-hash {
    font-family: monospace;
    font-size: 12px;
    color: var(--color-text-primary);
    background: var(--color-bg-base);
    padding: 3px 6px;
    border-radius: 3px;
    border: 1px solid var(--color-border);
  }

  .commit-subject {
    font-size: 12px;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 280px;
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

  .warn {
    margin: 0;
    font-size: 12px;
    color: #d16a6a;
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
</style>
