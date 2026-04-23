<script lang="ts">
  type Props = {
    shortHash: string;
    subject: string;
    targetBranch: string | null;
    onConfirm: () => void;
    onCancel: () => void;
  };

  let { shortHash, subject, targetBranch, onConfirm, onCancel }: Props =
    $props();

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onCancel} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3 class="title">Cherry-pick commit?</h3>
    <p class="body">
      Apply
      <code class="commit-hash">{shortHash}</code>
      <span class="commit-subject">{subject}</span>
      {#if targetBranch}
        onto <strong>{targetBranch}</strong>.
      {:else}
        onto the current HEAD.
      {/if}
    </p>

    <div class="actions">
      <button class="btn-cancel" onclick={onCancel}>Cancel</button>
      <button
        class="btn-primary"
        data-testid="cherry-pick-submit"
        onclick={onConfirm}
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
    width: 440px;
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

  .commit-subject {
    font-size: 12px;
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
</style>
