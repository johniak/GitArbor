<script lang="ts">
  type Props = {
    filter: string;
    selectedTab: 'local' | 'remote';
    onFilterChange: (value: string) => void;
    onSelectTab: (tab: 'local' | 'remote') => void;
    onNewClick: () => void;
  };

  let { filter, selectedTab, onFilterChange, onSelectTab, onNewClick }: Props =
    $props();
</script>

<div class="header">
  <div class="tabs" role="tablist">
    <button
      type="button"
      class="tab"
      class:active={selectedTab === 'local'}
      role="tab"
      aria-selected={selectedTab === 'local'}
      onclick={() => onSelectTab('local')}
    >
      Local
    </button>
    <button
      type="button"
      class="tab"
      class:active={selectedTab === 'remote'}
      role="tab"
      aria-selected={selectedTab === 'remote'}
      onclick={() => onSelectTab('remote')}
    >
      Remote
    </button>
  </div>

  <button type="button" class="new-btn" onclick={onNewClick}>
    New…
    <span class="caret">▾</span>
  </button>

  <div class="search">
    <input
      type="text"
      placeholder="Filter repositories"
      value={filter}
      oninput={(e) => onFilterChange((e.target as HTMLInputElement).value)}
      data-testid="repo-browser-filter"
    />
  </div>
</div>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
  }

  .tabs {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .tab {
    background: none;
    border: 0;
    color: var(--color-text-secondary);
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
  }

  .tab:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .tab.active {
    background: var(--color-bg-base);
    color: var(--color-text-primary);
  }

  .new-btn {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .new-btn:hover {
    background: var(--color-bg-hover);
  }

  .caret {
    font-size: 9px;
    opacity: 0.7;
  }

  .search {
    flex: 1;
  }

  .search input {
    width: 100%;
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    outline: none;
  }

  .search input:focus {
    border-color: var(--color-text-accent);
  }
</style>
