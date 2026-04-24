<script lang="ts">
  type Props = {
    onClone: () => void;
    onAddExisting: () => void;
    onCreateLocal: () => void;
    onScanDirectory: () => void;
    onClose: () => void;
  };

  let {
    onClone,
    onAddExisting,
    onCreateLocal,
    onScanDirectory,
    onClose,
  }: Props = $props();

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="overlay"
  onclick={onClose}
  role="presentation"
  aria-label="Close menu"
>
  <div class="menu" role="menu" onclick={(e) => e.stopPropagation()}>
    <button
      type="button"
      class="item"
      role="menuitem"
      data-testid="new-menu-clone"
      onclick={onClone}
    >
      Clone from URL
    </button>
    <div class="separator"></div>
    <button
      type="button"
      class="item"
      role="menuitem"
      data-testid="new-menu-add-existing"
      onclick={onAddExisting}
    >
      Add Existing Local Repository
    </button>
    <button
      type="button"
      class="item"
      role="menuitem"
      data-testid="new-menu-create-local"
      onclick={onCreateLocal}
    >
      Create Local Repository
    </button>
    <button
      type="button"
      class="item"
      role="menuitem"
      data-testid="new-menu-scan"
      onclick={onScanDirectory}
    >
      Scan Directory
    </button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 80;
  }

  .menu {
    position: absolute;
    top: 44px;
    left: 120px;
    min-width: 220px;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    padding: 4px 0;
    display: flex;
    flex-direction: column;
  }

  .item {
    background: none;
    border: 0;
    color: var(--color-text-primary);
    text-align: left;
    padding: 6px 14px;
    font-size: 12px;
    cursor: pointer;
  }

  .item:hover {
    background: var(--color-bg-hover);
  }

  .separator {
    height: 1px;
    margin: 4px 8px;
    background: var(--color-border);
  }
</style>
