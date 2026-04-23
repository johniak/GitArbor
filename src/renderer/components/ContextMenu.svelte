<script lang="ts">
  export type ContextMenuItem =
    | {
        label: string;
        onSelect: () => void;
        disabled?: boolean;
      }
    | { separator: true };

  function isSeparator(item: ContextMenuItem): item is { separator: true } {
    return 'separator' in item;
  }

  function isSelectable(
    item: ContextMenuItem,
  ): item is { label: string; onSelect: () => void; disabled?: boolean } {
    return !isSeparator(item) && !item.disabled;
  }

  type Props = {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
  };

  let { x, y, items, onClose }: Props = $props();

  let menuEl: HTMLDivElement | undefined = $state();
  let focusedIndex = $state(-1);

  // Position at cursor, clamp to viewport so the menu never gets cut off.
  let adjusted = $state({ x, y });

  $effect(() => {
    if (!menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (nx + rect.width > vw) nx = Math.max(0, vw - rect.width - 4);
    if (ny + rect.height > vh) ny = Math.max(0, vh - rect.height - 4);
    adjusted = { x: nx, y: ny };
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = nextEnabled(focusedIndex, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = nextEnabled(focusedIndex, -1);
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      const item = items[focusedIndex];
      if (item && isSelectable(item)) activate(item);
    }
  }

  function nextEnabled(start: number, dir: 1 | -1): number {
    const n = items.length;
    if (n === 0) return -1;
    let i = start;
    for (let step = 0; step < n; step++) {
      i = (i + dir + n) % n;
      if (isSelectable(items[i])) return i;
    }
    return start;
  }

  function activate(item: ContextMenuItem) {
    if (!isSelectable(item)) return;
    item.onSelect();
    onClose();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
  class="overlay"
  onclick={onClose}
  oncontextmenu={(e) => {
    e.preventDefault();
    onClose();
  }}
  role="presentation"
>
  <div
    class="context-menu commit-context-menu"
    bind:this={menuEl}
    style="left:{adjusted.x}px; top:{adjusted.y}px"
    role="menu"
    onclick={(e) => e.stopPropagation()}
  >
    {#each items as item, i}
      {#if isSeparator(item)}
        <hr class="context-separator" />
      {:else}
        <button
          class="context-item"
          class:focused={focusedIndex === i}
          disabled={item.disabled}
          role="menuitem"
          tabindex="-1"
          onmouseenter={() => (focusedIndex = i)}
          onclick={() => activate(item)}
        >
          {item.label}
        </button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
  }

  .context-menu {
    position: absolute;
    min-width: 180px;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
  }

  .context-item {
    background: none;
    border: none;
    color: var(--color-text-primary);
    text-align: left;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
  }

  .context-item:hover,
  .context-item.focused {
    background: var(--color-bg-hover);
  }

  .context-item:disabled {
    color: var(--color-text-secondary);
    cursor: not-allowed;
    opacity: 0.5;
  }

  .context-separator {
    height: 1px;
    margin: 4px 8px;
    background: var(--color-border);
    border: 0;
  }
</style>
