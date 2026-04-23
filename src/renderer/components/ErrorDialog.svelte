<script lang="ts">
  type Props = {
    title: string;
    message: string;
    details?: string;
    type?: 'error' | 'info';
    onClose: () => void;
  };

  let { title, message, details, type = 'error', onClose }: Props = $props();

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Enter') onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" onclick={onClose} role="dialog" aria-modal="true">
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <h3 class="title" class:info={type === 'info'}>{title}</h3>
    <p class="message">{message}</p>

    {#if details}
      <textarea class="details" readonly rows={8}>{details}</textarea>
    {/if}

    <div class="actions">
      <button class="btn-ok" onclick={onClose}>OK</button>
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
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--color-diff-deleted);
  }

  .title.info {
    color: var(--color-text-accent);
  }

  .message {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-primary);
    line-height: 1.5;
  }

  .details {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-family: monospace;
    font-size: 11px;
    line-height: 1.5;
    padding: 8px;
    border-radius: 4px;
    resize: vertical;
    outline: none;
    min-height: 60px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .btn-ok {
    padding: 6px 24px;
    border: none;
    background: #0e639c;
    color: white;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-ok:hover {
    background: #1177bb;
  }
</style>
