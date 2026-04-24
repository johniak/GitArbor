<script lang="ts">
  import {
    Smartphone,
    UserCircle,
    FileText,
    SlidersHorizontal,
    GitBranch,
    Zap,
    SlidersVertical,
    Download,
    Cog,
  } from '@lucide/svelte';

  export type Tab =
    | 'general'
    | 'accounts'
    | 'commit'
    | 'diff'
    | 'git'
    | 'custom-actions'
    | 'update'
    | 'advanced';

  type Props = {
    current: Tab;
    onSelect: (tab: Tab) => void;
  };

  let { current, onSelect }: Props = $props();

  // Only 'general' is enabled in v1. Others are roadmap placeholders.
  const tabs: Array<{
    id: Tab;
    label: string;
    icon: typeof Smartphone;
    enabled: boolean;
  }> = [
    { id: 'general', label: 'General', icon: Smartphone, enabled: true },
    { id: 'accounts', label: 'Accounts', icon: UserCircle, enabled: false },
    { id: 'commit', label: 'Commit', icon: FileText, enabled: false },
    { id: 'diff', label: 'Diff', icon: SlidersHorizontal, enabled: false },
    { id: 'git', label: 'Git', icon: GitBranch, enabled: false },
    {
      id: 'custom-actions',
      label: 'Custom Actions',
      icon: SlidersVertical,
      enabled: false,
    },
    { id: 'update', label: 'Update', icon: Download, enabled: false },
    { id: 'advanced', label: 'Advanced', icon: Cog, enabled: false },
  ];

  void Zap; // keep import stable if palette shifts
</script>

<div class="tabs" role="tablist">
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      role="tab"
      class="tab"
      class:active={current === tab.id}
      class:disabled={!tab.enabled}
      aria-selected={current === tab.id}
      disabled={!tab.enabled}
      onclick={() => tab.enabled && onSelect(tab.id)}
      data-testid="settings-tab-{tab.id}"
    >
      <tab.icon size={22} />
      <span class="label">{tab.label}</span>
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 4px;
    padding: 8px 12px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
  }

  .tab {
    background: none;
    border: 0;
    color: var(--color-text-secondary);
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    font-size: 10px;
    min-width: 60px;
  }

  .tab:hover:not(.disabled) {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }

  .tab.active {
    color: var(--color-text-accent);
  }

  .tab.disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .label {
    line-height: 1;
  }
</style>
