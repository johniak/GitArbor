<script lang="ts">
  import {
    GitCommitHorizontal,
    ArrowDownCircle,
    ArrowUpCircle,
    Clock,
    GitBranch,
    GitMerge,
    Package,
    Globe,
    Terminal,
    Settings,
  } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import type { ToolbarAction } from '../types';

  type Props = {
    onAction?: (action: ToolbarAction) => void;
    uncommittedCount?: number;
    aheadCount?: number;
    behindCount?: number;
  };

  let {
    onAction,
    uncommittedCount = 0,
    aheadCount = 0,
    behindCount = 0,
  }: Props = $props();

  type ToolbarButton = {
    icon: Component<Record<string, unknown>>;
    action: ToolbarAction;
    label: string;
  };

  const leftActions: ToolbarButton[] = [
    { icon: GitCommitHorizontal, action: 'commit', label: 'Commit' },
    { icon: ArrowDownCircle, action: 'pull', label: 'Pull' },
    { icon: ArrowUpCircle, action: 'push', label: 'Push' },
    { icon: Clock, action: 'fetch', label: 'Fetch' },
  ];

  const leftSecondary: ToolbarButton[] = [
    { icon: GitBranch, action: 'branch', label: 'Branch' },
    { icon: GitMerge, action: 'merge', label: 'Merge' },
    { icon: Package, action: 'stash', label: 'Stash' },
  ];

  const rightActions: ToolbarButton[] = [
    { icon: Globe, action: 'remote', label: 'Remote' },
    { icon: Terminal, action: 'terminal', label: 'Terminal' },
    { icon: Settings, action: 'settings', label: 'Settings' },
  ];
</script>

<div class="toolbar">
  <div class="toolbar-group">
    {#each leftActions as btn}
      <button class="toolbar-btn" onclick={() => onAction?.(btn.action)}>
        <div class="toolbar-icon">
          <btn.icon size={22} strokeWidth={1.5} color="var(--color-icon)" />
          {#if btn.action === 'commit' && uncommittedCount > 0}
            <span class="badge">{uncommittedCount}</span>
          {/if}
          {#if btn.action === 'push' && aheadCount > 0}
            <span class="badge push-badge">{aheadCount}</span>
          {/if}
          {#if btn.action === 'pull' && behindCount > 0}
            <span class="badge pull-badge">{behindCount}</span>
          {/if}
        </div>
        <span class="toolbar-label">{btn.label}</span>
      </button>
    {/each}

    <div class="separator"></div>

    {#each leftSecondary as btn}
      <button class="toolbar-btn" onclick={() => onAction?.(btn.action)}>
        <div class="toolbar-icon">
          <btn.icon size={22} strokeWidth={1.5} color="var(--color-icon)" />
        </div>
        <span class="toolbar-label">{btn.label}</span>
      </button>
    {/each}
  </div>

  <div class="spacer"></div>

  <div class="toolbar-group">
    {#each rightActions as btn}
      <button class="toolbar-btn" onclick={() => onAction?.(btn.action)}>
        <div class="toolbar-icon">
          <btn.icon size={22} strokeWidth={1.5} color="var(--color-icon)" />
        </div>
        <span class="toolbar-label">{btn.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: flex-end;
    padding: 6px 16px;
    background: var(--color-bg-toolbar);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .toolbar-group {
    display: flex;
    align-items: flex-end;
    gap: 0;
  }

  .spacer {
    flex: 1;
  }

  .separator {
    width: 1px;
    height: 32px;
    background: var(--color-border);
    margin: 0 10px 4px;
  }

  .toolbar-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px 14px;
    cursor: pointer;
    border-radius: 4px;
    border: none;
    background: none;
    transition: background 0.15s;
  }

  .toolbar-btn:hover {
    background: var(--color-bg-hover);
  }

  .toolbar-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .badge {
    position: absolute;
    top: -4px;
    right: -8px;
    background: var(--color-text-accent);
    color: var(--color-bg-base);
    font-size: 8px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 8px;
    line-height: 1.2;
  }

  .push-badge {
    background: var(--color-diff-added);
  }

  .pull-badge {
    background: var(--color-text-accent);
  }

  .toolbar-label {
    font-size: 10px;
    color: var(--color-text-primary);
    margin-top: 2px;
  }
</style>
