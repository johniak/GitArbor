<script lang="ts">
  import { GitBranch, Lock, Plus, X, Home } from '@lucide/svelte';
  import type { Worktree } from '../../shared/ipc';

  type TabEntry = Worktree & { isActive: boolean };

  type Props = {
    tabs: TabEntry[];
    onSwitchTab: (path: string) => void;
    onCloseTab: (path: string) => void;
    onCreateTab: () => void;
  };

  let { tabs, onSwitchTab, onCloseTab, onCreateTab }: Props = $props();

  function tabLabel(t: Worktree): string {
    if (t.isDetached) {
      return t.head ? `(detached @ ${t.head.slice(0, 7)})` : '(detached)';
    }
    return t.branch ?? t.path.split('/').pop() ?? t.path;
  }
</script>

<div class="tab-bar" data-testid="worktree-tab-bar">
  {#each tabs as tab (tab.path)}
    <button
      type="button"
      class="tab"
      class:active={tab.isActive}
      onclick={() => onSwitchTab(tab.path)}
      title={tab.path}
      data-testid="worktree-tab"
    >
      {#if tab.isMain}
        <Home size={12} />
      {:else}
        <GitBranch size={12} />
      {/if}
      <span class="label">{tabLabel(tab)}</span>
      {#if tab.locked}
        <Lock size={11} class="lock-icon" />
      {/if}
      {#if tab.dirty}
        <span class="dirty-dot" aria-label="uncommitted changes"></span>
      {/if}
      {#if !tab.isMain}
        <button
          type="button"
          class="close"
          aria-label="Close tab"
          onclick={(e) => {
            e.stopPropagation();
            onCloseTab(tab.path);
          }}
          data-testid="worktree-tab-close"
        >
          <X size={11} />
        </button>
      {/if}
    </button>
  {/each}
  <button
    type="button"
    class="add"
    onclick={onCreateTab}
    title="Create worktree"
    aria-label="Create worktree"
    data-testid="worktree-tab-create"
  >
    <Plus size={14} />
  </button>
</div>

<style>
  .tab-bar {
    display: flex;
    align-items: stretch;
    gap: 2px;
    padding: 4px 6px 0 6px;
    background: var(--color-bg-toolbar);
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px 6px 10px;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-bottom: none;
    border-radius: 5px 5px 0 0;
    color: var(--color-text-secondary);
    font-size: 12px;
    cursor: pointer;
    max-width: 240px;
    min-width: 0;
    position: relative;
    bottom: -1px; /* overlap the bottom border so active tab "joins" content */
  }

  .tab:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .tab.active {
    background: var(--color-bg-base);
    color: var(--color-text-primary);
    border-color: var(--color-border);
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dirty-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-text-accent);
    flex-shrink: 0;
  }

  :global(.lock-icon) {
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-left: 2px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    border-radius: 3px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 80ms;
  }

  .tab:hover .close,
  .tab.active .close {
    opacity: 1;
  }

  .close:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    margin-bottom: 1px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    border-radius: 4px;
    cursor: pointer;
    align-self: center;
  }

  .add:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
</style>
