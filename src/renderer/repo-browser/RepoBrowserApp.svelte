<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { RepoListEntry } from '../../shared/ipc';
  import RepoBrowserHeader from './RepoBrowserHeader.svelte';
  import RepoRow from './RepoRow.svelte';
  import NewRepoMenu from './NewRepoMenu.svelte';
  import CloneDialog from './CloneDialog.svelte';
  import ProgressDialog from '../components/ProgressDialog.svelte';
  import { themeStore } from '../theme-store.svelte';

  let repos = $state<RepoListEntry[]>([]);
  let filter = $state('');
  let selectedTab = $state<'local' | 'remote'>('local');
  let loading = $state(true);
  let newMenuOpen = $state(false);
  let cloneDialogOpen = $state(false);
  let busy = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);
  let projectFolder = $state('');

  async function refresh() {
    loading = true;
    try {
      repos = await window.electronAPI.repo.loadList();
    } finally {
      loading = false;
    }
  }

  async function loadProjectFolder() {
    try {
      const s = await window.electronAPI.appSettings.get();
      projectFolder = s.general.projectFolder;
    } catch {
      projectFolder = '';
    }
  }

  let unsubscribeAppSettings: (() => void) | null = null;

  onMount(() => {
    void themeStore.hydrate();
    void refresh();
    void loadProjectFolder();
    unsubscribeAppSettings = window.electronAPI.appSettings.onChanged((s) => {
      projectFolder = s.general.projectFolder;
    });
  });

  onDestroy(() => {
    unsubscribeAppSettings?.();
  });

  let filteredRepos = $derived(
    filter.trim().length === 0
      ? repos
      : repos.filter((r) => {
          const q = filter.toLowerCase();
          return (
            r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)
          );
        }),
  );

  async function openRepo(path: string) {
    errorMsg = null;
    busy = `Opening ${path}...`;
    try {
      const res = await window.electronAPI.repo.open(path);
      if (!res.success) {
        errorMsg = res.error ?? 'Failed to open repository';
        return;
      }
      await refresh();
    } finally {
      busy = null;
    }
  }

  async function toggleFavourite(entry: RepoListEntry) {
    await window.electronAPI.repo.setFavourite(entry.path, !entry.isFavourite);
    await refresh();
  }

  async function removeFromList(entry: RepoListEntry) {
    await window.electronAPI.repo.removeFromList(entry.path);
    await refresh();
  }

  async function handleAddExisting() {
    newMenuOpen = false;
    const dir = await window.electronAPI.repo.pickDirectory({
      title: 'Add Existing Local Repository',
      defaultPath: projectFolder || undefined,
    });
    if (!dir) return;
    const entry = await window.electronAPI.repo.addExisting(dir);
    if (!entry) {
      errorMsg = `${dir} is not a git repository`;
      return;
    }
    await refresh();
  }

  async function handleCreateLocal() {
    newMenuOpen = false;
    const dir = await window.electronAPI.repo.pickDirectory({
      title: 'Create Local Repository In…',
      defaultPath: projectFolder || undefined,
    });
    if (!dir) return;
    busy = `Initialising ${dir}...`;
    try {
      const res = await window.electronAPI.repo.initLocal(dir);
      if (res.error) {
        errorMsg = res.error;
        return;
      }
      await refresh();
    } finally {
      busy = null;
    }
  }

  async function handleScanDirectory() {
    newMenuOpen = false;
    const dir = await window.electronAPI.repo.pickDirectory({
      title: 'Scan Directory For Repositories',
      defaultPath: projectFolder || undefined,
    });
    if (!dir) return;
    busy = `Scanning ${dir}...`;
    try {
      await window.electronAPI.repo.scan(dir);
      await refresh();
    } finally {
      busy = null;
    }
  }

  function handleCloneFromURL() {
    newMenuOpen = false;
    cloneDialogOpen = true;
  }

  async function handleCloneConfirm(args: { url: string; destPath: string }) {
    cloneDialogOpen = false;
    busy = `Cloning ${args.url}...`;
    try {
      const res = await window.electronAPI.repo.clone(args.url, args.destPath);
      if (res.error) {
        errorMsg = res.error;
        return;
      }
      await refresh();
      if (res.entry) await openRepo(res.entry.path);
    } finally {
      busy = null;
    }
  }
</script>

<div class="browser">
  <RepoBrowserHeader
    {filter}
    {selectedTab}
    onFilterChange={(v) => (filter = v)}
    onSelectTab={(t) => (selectedTab = t)}
    onNewClick={() => (newMenuOpen = !newMenuOpen)}
  />

  {#if newMenuOpen}
    <NewRepoMenu
      onClone={handleCloneFromURL}
      onAddExisting={handleAddExisting}
      onCreateLocal={handleCreateLocal}
      onScanDirectory={handleScanDirectory}
      onClose={() => (newMenuOpen = false)}
    />
  {/if}

  {#if errorMsg}
    <div class="banner error">
      <span>{errorMsg}</span>
      <button class="banner-close" onclick={() => (errorMsg = null)}>×</button>
    </div>
  {/if}

  {#if selectedTab === 'remote'}
    <div class="empty">Remote hosting integrations are not available yet.</div>
  {:else if loading}
    <div class="empty">Loading repositories…</div>
  {:else if repos.length === 0}
    <div class="empty">
      No favourite repositories yet.
      <br />
      Use <strong>New…</strong> to clone or add one.
    </div>
  {:else if filteredRepos.length === 0}
    <div class="empty">No repositories match “{filter}”.</div>
  {:else}
    <div class="rows" role="list">
      {#each filteredRepos as repo (repo.path)}
        <RepoRow
          {repo}
          onOpen={() => openRepo(repo.path)}
          onToggleFavourite={() => toggleFavourite(repo)}
          onRemove={() => removeFromList(repo)}
        />
      {/each}
    </div>
  {/if}
</div>

{#if cloneDialogOpen}
  <CloneDialog
    defaultDestPath={projectFolder}
    onConfirm={handleCloneConfirm}
    onCancel={() => (cloneDialogOpen = false)}
  />
{/if}

{#if busy}
  <ProgressDialog message={busy} />
{/if}

<style>
  .browser {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg-base);
    color: var(--color-text-primary);
    position: relative;
  }

  .rows {
    flex: 1;
    overflow-y: auto;
  }

  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--color-text-secondary);
    font-size: 13px;
    padding: 24px;
    line-height: 1.6;
  }

  .banner {
    padding: 8px 14px;
    font-size: 12px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .banner.error {
    background: rgba(210, 100, 100, 0.12);
    color: #d26464;
    border-bottom-color: rgba(210, 100, 100, 0.3);
  }

  .banner-close {
    margin-left: auto;
    background: none;
    border: 0;
    color: inherit;
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
    padding: 0 4px;
  }
</style>
