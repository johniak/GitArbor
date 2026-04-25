<script lang="ts">
  import fuzzysort from 'fuzzysort';
  import { Folder } from '@lucide/svelte';
  import type { Branch, SidebarData, SidebarView } from '../types';
  import { settingsStore } from '../settings-store.svelte';

  interface BranchTreeNode {
    name: string;
    fullPath: string;
    isFolder: boolean;
    children: BranchTreeNode[];
    branch?: Branch;
  }

  function buildBranchTree(branches: Branch[]): BranchTreeNode[] {
    const root: BranchTreeNode[] = [];
    const sorted = [...branches].sort((a, b) => a.name.localeCompare(b.name));

    for (const branch of sorted) {
      const segments = branch.name.split('/');
      let current = root;
      let pathSoFar = '';

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg;
        const isLast = i === segments.length - 1;

        if (isLast) {
          current.push({
            name: seg,
            fullPath: branch.name,
            isFolder: false,
            children: [],
            branch,
          });
        } else {
          let folder = current.find((n) => n.isFolder && n.name === seg);
          if (!folder) {
            folder = {
              name: seg,
              fullPath: pathSoFar,
              isFolder: true,
              children: [],
            };
            current.push(folder);
          }
          current = folder.children;
        }
      }
    }
    return root;
  }

  function buildStringTree(names: string[]): BranchTreeNode[] {
    const fakeBranches = names.map((n) => ({ name: n }) as Branch);
    return buildBranchTree(fakeBranches);
  }

  type NavItem = { id: SidebarView; label: string; icon: string };

  type Props = {
    data: SidebarData;
    currentBranch?: string | null;
    activeView?: SidebarView;
    onViewChange?: (view: SidebarView) => void;
    onCheckoutBranch?: (name: string) => void;
    onApplyStash?: (index: number, message: string) => void;
    onMergeBranch?: (name: string) => void;
    onRebaseBranch?: (name: string) => void;
    onDeleteBranch?: (name: string) => void;
    onCheckoutRemoteBranch?: (remoteName: string, branch: string) => void;
    onNewBranch?: () => void;
    onScrollToBranch?: (branchName: string) => void;
  };

  let {
    data,
    currentBranch = null,
    activeView = 'history',
    onViewChange,
    onCheckoutBranch,
    onApplyStash,
    onMergeBranch,
    onRebaseBranch,
    onDeleteBranch,
    onCheckoutRemoteBranch,
    onNewBranch,
    onScrollToBranch,
  }: Props = $props();

  const navItems: NavItem[] = [
    { id: 'file-status', label: 'File Status', icon: '📋' },
    { id: 'history', label: 'History', icon: '🕐' },
    { id: 'search', label: 'Search', icon: '🔍' },
  ];

  const simpleSectionKeys = ['Tags', 'Stashes'] as const;
  const PERSISTED_SECTION_KEYS = new Set([
    'Branches',
    'Tags',
    'Remotes',
    'Stashes',
  ]);
  let expandedState = $state<Record<string, boolean>>({});

  let branchTree = $derived.by(() => {
    if (!filterText) return buildBranchTree(data.branches);
    const names = data.branches.map((b) => b.name);
    const matched = new Set(
      fuzzysort.go(filterText, names).map((r) => r.target),
    );
    return buildBranchTree(data.branches.filter((b) => matched.has(b.name)));
  });

  function sectionExpanded(label: string): boolean {
    if (PERSISTED_SECTION_KEYS.has(label)) {
      return settingsStore.settings.sidebarSections[
        label as 'Branches' | 'Tags' | 'Remotes' | 'Stashes'
      ];
    }
    return expandedState[label] ?? true;
  }

  let simpleSections = $derived(
    simpleSectionKeys.map((label) => {
      const items =
        label === 'Tags'
          ? data.tags.map((t) => t.name)
          : data.stashes.map((s) => s.message);
      return { label, items, expanded: sectionExpanded(label) };
    }),
  );

  function toggleSection(label: string) {
    if (PERSISTED_SECTION_KEYS.has(label)) {
      const key = label as 'Branches' | 'Tags' | 'Remotes' | 'Stashes';
      settingsStore.update({
        sidebarSections: {
          [key]: !settingsStore.settings.sidebarSections[key],
        },
      });
    } else {
      expandedState[label] = !(expandedState[label] ?? true);
    }
  }

  let filterText = $state('');
  let contextMenu = $state<{ x: number; y: number; branch: string } | null>(
    null,
  );

  function showContextMenu(e: MouseEvent, branch: string) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY, branch };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function fuzzyFilter(items: string[]): string[] {
    if (!filterText) return items;
    return fuzzysort.go(filterText, items).map((r) => r.target);
  }

  function selectView(id: SidebarView) {
    onViewChange?.(id);
  }
</script>

<div class="sidebar">
  <div class="sidebar-content">
    <div class="nav-section">
      {#each navItems as item}
        <button
          class="nav-item"
          class:active={activeView === item.id}
          onclick={() => selectView(item.id)}
        >
          <span class="nav-icon">{item.icon}</span>
          {item.label}
        </button>
      {/each}
    </div>

    <!-- Branches — tree with folder hierarchy -->
    <div class="tree-section">
      <button
        class="section-header"
        onclick={() => toggleSection('Branches')}
        oncontextmenu={(e) => {
          e.preventDefault();
          contextMenu = { x: e.clientX, y: e.clientY, branch: '__new__' };
        }}
      >
        <span class="expand-arrow"
          >{sectionExpanded('Branches') ? '▾' : '▸'}</span
        >
        Branches
      </button>
      {#if sectionExpanded('Branches')}
        {#snippet branchNode(node: BranchTreeNode, depth: number)}
          {#if node.isFolder}
            <button
              class="tree-folder"
              style="padding-left:{16 + depth * 16}px"
              onclick={() =>
                (expandedState[`bf:${node.fullPath}`] = !(
                  expandedState[`bf:${node.fullPath}`] ?? true
                ))}
            >
              <span class="expand-arrow"
                >{(expandedState[`bf:${node.fullPath}`] ?? true)
                  ? '▾'
                  : '▸'}</span
              >
              <Folder size={12} />
              {node.name}
            </button>
            {#if expandedState[`bf:${node.fullPath}`] ?? true}
              {#each node.children as child}
                {@render branchNode(child, depth + 1)}
              {/each}
            {/if}
          {:else}
            <div
              class="tree-item"
              style="padding-left:{16 + depth * 16}px"
              class:current-branch={node.branch?.current}
              onclick={() => onScrollToBranch?.(node.fullPath)}
              ondblclick={() => onCheckoutBranch?.(node.fullPath)}
              oncontextmenu={(e) => showContextMenu(e, node.fullPath)}
            >
              {#if node.branch?.current}
                <span class="branch-dot">●</span>
              {/if}
              {node.name}
              {#if node.branch?.ahead}
                <span class="ahead-behind ahead">↑{node.branch.ahead}</span>
              {/if}
              {#if node.branch?.behind}
                <span class="ahead-behind behind">↓{node.branch.behind}</span>
              {/if}
            </div>
          {/if}
        {/snippet}
        {#each branchTree as node}
          {@render branchNode(node, 0)}
        {/each}
        {#if data.branches.length === 0}
          <div class="tree-item empty">No branches</div>
        {/if}
      {/if}
    </div>

    <!-- Tags and Stashes — flat lists -->
    {#each simpleSections as section}
      <div class="tree-section">
        <button
          class="section-header"
          onclick={() => toggleSection(section.label)}
        >
          <span class="expand-arrow">{section.expanded ? '▾' : '▸'}</span>
          {section.label}
        </button>
        {#if section.expanded}
          {#each fuzzyFilter(section.items) as item, i}
            <div
              class="tree-item"
              ondblclick={() => {
                if (section.label === 'Stashes') onApplyStash?.(i, item);
              }}
            >
              {item}
            </div>
          {/each}
          {#if section.items.length === 0}
            <div class="tree-item empty">No {section.label.toLowerCase()}</div>
          {/if}
        {/if}
      </div>
    {/each}

    <!-- Remotes — expandable tree with sub-branches -->
    <div class="tree-section">
      <button class="section-header" onclick={() => toggleSection('Remotes')}>
        <span class="expand-arrow"
          >{sectionExpanded('Remotes') ? '▾' : '▸'}</span
        >
        Remotes
      </button>
      {#if sectionExpanded('Remotes')}
        {#each data.remotes as remote}
          <button
            class="remote-name"
            onclick={() =>
              (expandedState[`remote:${remote.name}`] =
                !expandedState[`remote:${remote.name}`])}
          >
            <span class="expand-arrow"
              >{expandedState[`remote:${remote.name}`] !== false
                ? '▾'
                : '▸'}</span
            >
            {remote.name}
          </button>
          {#if expandedState[`remote:${remote.name}`] !== false}
            {#snippet remoteNode(
              node: BranchTreeNode,
              depth: number,
              remoteName: string,
            )}
              {#if node.isFolder}
                <button
                  class="tree-folder"
                  style="padding-left:{28 + depth * 16}px"
                  onclick={() =>
                    (expandedState[`rf:${remoteName}/${node.fullPath}`] = !(
                      expandedState[`rf:${remoteName}/${node.fullPath}`] ?? true
                    ))}
                >
                  <span class="expand-arrow"
                    >{(expandedState[`rf:${remoteName}/${node.fullPath}`] ??
                    true)
                      ? '▾'
                      : '▸'}</span
                  >
                  <Folder size={12} />
                  {node.name}
                </button>
                {#if expandedState[`rf:${remoteName}/${node.fullPath}`] ?? true}
                  {#each node.children as child}
                    {@render remoteNode(child, depth + 1, remoteName)}
                  {/each}
                {/if}
              {:else}
                <div
                  class="tree-item remote-branch"
                  style="padding-left:{28 + depth * 16}px"
                  onclick={() =>
                    onScrollToBranch?.(`${remoteName}/${node.fullPath}`)}
                  ondblclick={() =>
                    onCheckoutRemoteBranch?.(remoteName, node.fullPath)}
                >
                  {node.name}
                </div>
              {/if}
            {/snippet}
            {@const remoteTree = buildStringTree(fuzzyFilter(remote.branches))}
            {#each remoteTree as node}
              {@render remoteNode(node, 0, remote.name)}
            {/each}
          {/if}
        {/each}
        {#if data.remotes.length === 0}
          <div class="tree-item empty">No remotes</div>
        {/if}
      {/if}
    </div>
  </div>

  <div class="filter-bar">
    <input
      type="text"
      class="filter-input"
      placeholder="Filter branches..."
      bind:value={filterText}
    />
  </div>
</div>

<svelte:window
  onkeydown={(e) => {
    if (contextMenu && e.key === 'Escape') closeContextMenu();
  }}
  onclick={() => {
    if (contextMenu) closeContextMenu();
  }}
/>

{#if contextMenu}
  <div
    class="context-menu"
    style="left:{contextMenu.x}px;top:{contextMenu.y}px"
    onclick={(e) => e.stopPropagation()}
  >
    {#if contextMenu.branch === '__new__'}
      <button
        class="context-item"
        onclick={() => {
          onNewBranch?.();
          closeContextMenu();
        }}
      >
        New Branch...
      </button>
    {:else}
      <button
        class="context-item"
        onclick={() => {
          onNewBranch?.();
          closeContextMenu();
        }}
      >
        New Branch...
      </button>
      <button
        class="context-item"
        onclick={() => {
          onMergeBranch?.(contextMenu!.branch);
          closeContextMenu();
        }}
      >
        Merge {contextMenu.branch} into {currentBranch ?? 'current'}
      </button>
      <button
        class="context-item"
        onclick={() => {
          onRebaseBranch?.(contextMenu!.branch);
          closeContextMenu();
        }}
      >
        Rebase current changes onto {contextMenu.branch}
      </button>
      <div class="context-separator"></div>
      <button
        class="context-item context-item-danger"
        disabled={contextMenu.branch === currentBranch}
        title={contextMenu.branch === currentBranch
          ? 'Cannot delete the current branch'
          : ''}
        onclick={() => {
          onDeleteBranch?.(contextMenu!.branch);
          closeContextMenu();
        }}
      >
        Delete {contextMenu.branch}...
      </button>
    {/if}
  </div>
{/if}

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg-surface);
    overflow: hidden;
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .nav-section {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 8px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: none;
    background: none;
    color: var(--color-text-primary);
    font-size: 11px;
    cursor: pointer;
    border-radius: 4px;
    text-align: left;
    width: 100%;
  }

  .nav-item:hover {
    background: var(--color-bg-hover);
  }

  .nav-item.active {
    background: var(--color-bg-selected);
    color: var(--color-text-white);
  }

  .nav-icon {
    font-size: 12px;
  }

  .tree-section {
    margin-bottom: 4px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 8px 4px;
    color: var(--color-text-secondary);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: none;
    background: none;
    cursor: pointer;
    width: 100%;
    text-align: left;
  }

  .expand-arrow {
    font-size: 10px;
    width: 10px;
  }

  .tree-folder {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px 4px 16px;
    font-size: 11px;
    color: var(--color-text-accent-light);
    cursor: pointer;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    border-radius: 4px;
  }

  .tree-folder:hover {
    background: var(--color-bg-hover);
  }

  .tree-item {
    padding: 4px 8px 4px 24px;
    font-size: 11px;
    color: var(--color-text-accent-light);
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ahead-behind {
    font-size: 9px;
    font-weight: 600;
    padding: 0 3px;
    border-radius: 3px;
    line-height: 14px;
  }

  .ahead {
    color: var(--color-diff-added);
  }

  .behind {
    color: var(--color-text-accent);
  }

  .tree-item:hover {
    background: var(--color-bg-hover);
  }

  .tree-item.current-branch {
    color: var(--color-text-white);
    font-weight: 700;
  }

  .tree-item.empty {
    color: var(--color-text-secondary);
    font-style: italic;
    cursor: default;
  }

  .remote-name {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px 4px 16px;
    font-size: 11px;
    color: var(--color-text-accent-light);
    cursor: pointer;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    border-radius: 4px;
  }

  .remote-name:hover {
    background: var(--color-bg-hover);
  }

  .remote-branch {
    padding-left: 28px;
  }

  .branch-dot {
    margin-right: 4px;
    font-size: 8px;
  }

  .filter-bar {
    padding: 6px 8px;
    border-top: 1px solid var(--color-border);
  }

  .filter-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    outline: none;
  }

  .filter-input:focus {
    border-color: var(--color-text-accent);
  }

  .context-menu {
    position: fixed;
    z-index: 200;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 4px 0;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    min-width: 220px;
  }

  .context-item {
    display: block;
    width: 100%;
    padding: 8px 16px;
    border: none;
    background: none;
    color: var(--color-text-primary);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .context-item:hover:not(:disabled) {
    background: var(--color-bg-selected);
    color: var(--color-text-white);
  }

  .context-item:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .context-item-danger {
    color: var(--color-diff-deleted);
  }

  .context-item-danger:hover:not(:disabled) {
    background: var(--color-diff-deleted);
    color: var(--color-text-white);
  }

  .context-separator {
    height: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }
</style>
