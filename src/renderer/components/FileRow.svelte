<script lang="ts">
  import {
    Pencil,
    Plus,
    Minus,
    ArrowRight,
    Copy,
    AlertTriangle,
    CirclePlus,
  } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import type { ChangedFile, FileStatus } from '../types';

  type Props = {
    file: ChangedFile;
    selected?: boolean;
    /** When true, render a checkbox before the icon. */
    showCheckbox?: boolean;
    /** Whether the checkbox is checked. */
    checked?: boolean;
    /** Indent in pixels (used by tree view). */
    indent?: number;
    /** Override the displayed label (used in tree view to show basename). */
    displayLabel?: string;
    /** Visually de-emphasise the row (used by no-staging "exclude"). */
    excluded?: boolean;
    /** Render in multi-column table mode (Filename + Path columns). */
    multi?: boolean;
    onClick?: (e: MouseEvent) => void;
    onContextMenu?: (e: MouseEvent) => void;
    onCheckChange?: () => void;
  };

  let {
    file,
    selected = false,
    showCheckbox = false,
    checked = false,
    indent = 0,
    displayLabel,
    excluded = false,
    multi = false,
    onClick,
    onContextMenu,
    onCheckChange,
  }: Props = $props();

  const STATUS_ICON: Record<FileStatus, { icon: Component; color: string }> = {
    M: { icon: Pencil, color: '#e2a04f' },
    A: { icon: Plus, color: '#5cb85c' },
    D: { icon: Minus, color: '#d9534f' },
    R: { icon: ArrowRight, color: '#5bc0de' },
    C: { icon: Copy, color: '#5bc0de' },
    U: { icon: AlertTriangle, color: '#d9534f' },
    '?': { icon: CirclePlus, color: '#5cb85c' },
  };

  let basename = $derived.by(() => {
    const i = file.path.lastIndexOf('/');
    return i === -1 ? file.path : file.path.slice(i + 1);
  });
  let parentDir = $derived.by(() => {
    const i = file.path.lastIndexOf('/');
    return i === -1 ? '' : file.path.slice(0, i);
  });
</script>

{#if multi}
  <div
    class="file-row file-row-multi"
    class:selected
    class:excluded
    oncontextmenu={onContextMenu}
    onclick={onClick}
    role="button"
    tabindex="0"
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(e as unknown as MouseEvent);
      }
    }}
  >
    {#if showCheckbox}
      <input
        type="checkbox"
        class="stage-checkbox"
        {checked}
        onclick={(e: MouseEvent) => {
          e.stopPropagation();
          onCheckChange?.();
        }}
      />
    {:else}
      <span class="checkbox-spacer"></span>
    {/if}
    <span class="file-status">
      <svelte:component
        this={STATUS_ICON[file.status].icon}
        size={14}
        color={STATUS_ICON[file.status].color}
      />
    </span>
    <span class="file-filename" class:white={selected}>{basename}</span>
    <span class="file-parent">{parentDir}</span>
  </div>
{:else if showCheckbox}
  <div
    class="file-row"
    class:selected
    class:excluded
    style="padding-left: {12 + indent}px"
    oncontextmenu={onContextMenu}
    onclick={onClick}
    role="button"
    tabindex="0"
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(e as unknown as MouseEvent);
      }
    }}
  >
    <input
      type="checkbox"
      class="stage-checkbox"
      {checked}
      onclick={(e: MouseEvent) => {
        e.stopPropagation();
        onCheckChange?.();
      }}
    />
    <span class="file-status">
      <svelte:component
        this={STATUS_ICON[file.status].icon}
        size={14}
        color={STATUS_ICON[file.status].color}
      />
    </span>
    <span class="file-path" class:white={selected}
      >{displayLabel ?? file.path}</span
    >
  </div>
{:else}
  <button
    type="button"
    class="file-row"
    class:selected
    class:excluded
    style="padding-left: {12 + indent}px"
    oncontextmenu={onContextMenu}
    onclick={onClick}
  >
    <span class="file-status">
      <svelte:component
        this={STATUS_ICON[file.status].icon}
        size={14}
        color={STATUS_ICON[file.status].color}
      />
    </span>
    <span class="file-path" class:white={selected}
      >{displayLabel ?? file.path}</span
    >
  </button>
{/if}

<style>
  .file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border: none;
    background: none;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
    text-align: left;
    font-size: 11px;
    font-family: inherit;
    color: var(--color-text-primary);
  }

  .file-row-multi {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    gap: 8px;
    padding: 4px 12px;
  }

  .file-row:hover {
    background: var(--color-bg-hover);
  }

  .file-row.selected {
    background: var(--color-bg-selected);
  }

  .file-row.excluded .file-path,
  .file-row.excluded .file-filename {
    text-decoration: line-through;
    opacity: 0.55;
  }

  .file-status {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .file-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-path.white,
  .file-filename.white {
    color: var(--color-text-white);
  }

  .file-filename {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-parent {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-secondary);
    font-size: 10px;
  }

  .stage-checkbox {
    flex-shrink: 0;
    cursor: pointer;
    accent-color: var(--color-text-accent);
  }

  .checkbox-spacer {
    width: 0;
    height: 0;
  }
</style>
