<script lang="ts">
  import TopToolbar from './components/TopToolbar.svelte';
  import LeftSidebar from './components/LeftSidebar.svelte';
  import CommitLog from './components/CommitLog.svelte';
  import FileList from './components/FileList.svelte';
  import DiffViewer from './components/DiffViewer.svelte';
  import Splitter from './components/Splitter.svelte';
  import CommitPanel from './components/CommitPanel.svelte';
  import StashDialog from './components/StashDialog.svelte';
  import ApplyStashDialog from './components/ApplyStashDialog.svelte';
  import ErrorDialog from './components/ErrorDialog.svelte';
  import ProgressDialog from './components/ProgressDialog.svelte';
  import CreateBranchDialog from './components/CreateBranchDialog.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import AddTagDialog, {
    type TagAction,
  } from './components/AddTagDialog.svelte';
  import PushDialog, { type PushAction } from './components/PushDialog.svelte';
  import ResetCommitDialog, {
    type ResetMode,
  } from './components/ResetCommitDialog.svelte';
  import RevertCommitDialog from './components/RevertCommitDialog.svelte';
  import CherryPickDialog from './components/CherryPickDialog.svelte';
  import PushRevisionDialog from './components/PushRevisionDialog.svelte';
  import ConflictBanner from './components/ConflictBanner.svelte';
  import DeleteBranchDialog from './components/DeleteBranchDialog.svelte';
  import SearchView from './components/SearchView.svelte';
  import type { OperationInProgress } from '../shared/ipc';
  import { mockSidebar, mockCommits, mockFiles, mockDiff } from './mock-data';
  import type {
    ChangedFile,
    Commit,
    GraphRow,
    GraphState,
    SidebarData,
    SidebarView,
    ToolbarAction,
    WorkingStatus,
  } from './types';
  import { computeGraphIncremental, createGraphState } from './graph';
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { settingsStore } from './settings-store.svelte';
  import { STORAGE_KEY, loadWidths } from './column-widths';

  const PAGE_SIZE = 100;

  // Splitter state — hydrated from settings store
  let sidebarWidth = $derived(settingsStore.settings.layout.sidebarWidth);
  let commitLogHeight = $derived(settingsStore.settings.layout.commitLogHeight);
  let fileListWidth = $derived(settingsStore.settings.layout.fileListWidth);

  // FileList view/sort/filter/staging settings (per-context, persisted per-repo)
  let workingViewMode = $derived(
    settingsStore.settings.fileList.working.viewMode,
  );
  let workingSortMode = $derived(
    settingsStore.settings.fileList.working.sortMode,
  );
  let workingStatusFilter = $derived(
    settingsStore.settings.fileList.working.statusFilter,
  );
  let workingStagingMode = $derived(
    settingsStore.settings.fileList.working.stagingMode,
  );
  let historicalViewMode = $derived(
    settingsStore.settings.fileList.historical.viewMode,
  );
  let historicalSortMode = $derived(
    settingsStore.settings.fileList.historical.sortMode,
  );

  // Per-session "exclude from next commit" set, used in no-staging mode.
  let excludedPaths = new SvelteSet<string>();

  // Reset excluded set when staging mode changes away from 'none'.
  $effect(() => {
    if (workingStagingMode !== 'none' && excludedPaths.size > 0) {
      excludedPaths.clear();
    }
  });

  function toggleExclude(path: string) {
    if (excludedPaths.has(path)) excludedPaths.delete(path);
    else excludedPaths.add(path);
  }

  // Setting writers — route to the right per-context branch.
  function setWorkingViewMode(viewMode: typeof workingViewMode) {
    settingsStore.update({ fileList: { working: { viewMode } } });
  }
  function setWorkingSortMode(sortMode: typeof workingSortMode) {
    settingsStore.update({ fileList: { working: { sortMode } } });
  }
  function setWorkingStatusFilter(statusFilter: typeof workingStatusFilter) {
    settingsStore.update({ fileList: { working: { statusFilter } } });
  }
  function setWorkingStagingMode(stagingMode: typeof workingStagingMode) {
    settingsStore.update({ fileList: { working: { stagingMode } } });
  }
  function setHistoricalViewMode(viewMode: typeof historicalViewMode) {
    settingsStore.update({ fileList: { historical: { viewMode } } });
  }
  function setHistoricalSortMode(sortMode: typeof historicalSortMode) {
    settingsStore.update({ fileList: { historical: { sortMode } } });
  }

  // History view dispatches based on whether "Uncommitted changes" is selected.
  let historyContextViewMode = $derived(
    isWorkingChangesSelected ? workingViewMode : historicalViewMode,
  );
  let historyContextSortMode = $derived(
    isWorkingChangesSelected ? workingSortMode : historicalSortMode,
  );
  function setHistoryContextViewMode(m: typeof workingViewMode) {
    if (isWorkingChangesSelected) setWorkingViewMode(m);
    else setHistoricalViewMode(m);
  }
  function setHistoryContextSortMode(m: typeof workingSortMode) {
    if (isWorkingChangesSelected) setWorkingSortMode(m);
    else setHistoricalSortMode(m);
  }

  const MIN_SIDEBAR = 150;
  const MAX_SIDEBAR = 400;
  const MIN_COMMIT_LOG = 100;
  const MIN_FILE_LIST = 150;
  const MAX_FILE_LIST = 500;

  function resizeSidebar(delta: number) {
    const next = Math.max(
      MIN_SIDEBAR,
      Math.min(MAX_SIDEBAR, sidebarWidth + delta),
    );
    settingsStore.update({ layout: { sidebarWidth: next } });
  }

  function resizeCommitLog(delta: number) {
    const next = Math.max(MIN_COMMIT_LOG, commitLogHeight + delta);
    settingsStore.update({ layout: { commitLogHeight: next } });
  }

  function resizeFileList(delta: number) {
    const next = Math.max(
      MIN_FILE_LIST,
      Math.min(MAX_FILE_LIST, fileListWidth + delta),
    );
    settingsStore.update({ layout: { fileListWidth: next } });
  }

  // App state
  let sidebarData = $state<SidebarData>(mockSidebar);
  let commits = $state<Commit[]>(mockCommits);
  const initialGraph = computeGraphIncremental(mockCommits, createGraphState());
  let graphRows = $state<GraphRow[]>(initialGraph.rows);
  let graphState = $state<GraphState>(initialGraph.state);
  let hasMore = $state(true);
  let loading = $state(false);
  let showAllBranches = $derived(settingsStore.settings.graph.showAllBranches);
  let logOrder = $derived(settingsStore.settings.graph.logOrder);
  let activeView = $state<SidebarView>('history');
  let selectedCommit = $state<string | null>(mockCommits[0]?.hashShort ?? null);
  let selectedCommitFullHash = $state<string | null>(null);
  let isWorkingChangesSelected = $state(false);
  let workingStatus = $state<WorkingStatus | null>(null);
  let operationInProgress = $state<OperationInProgress | null>(null);
  let changedFiles = $state<ChangedFile[]>(mockFiles);
  let selectedFile = $state<string | null>(mockFiles[0]?.path ?? null);
  let selectedFileStaged = $state(false);
  let currentDiff = $state<import('./types').FileDiff | null>(mockDiff);
  let selectedCommitData = $state<import('./types').Commit | null>(null);
  let commitBody = $state('');
  let scrollToIndex = $state<number | null>(null);

  let showStashDialog = $state(false);
  let branchDialog = $state<{ startPoint?: string } | null>(null);
  let showPushDialog = $state(false);
  let resetDialog = $state<{
    hash: string;
    shortHash: string;
    subject: string;
    branch: string;
  } | null>(null);
  let revertDialog = $state<{
    hash: string;
    shortHash: string;
    subject: string;
  } | null>(null);
  let cherryPickDialog = $state<{
    hash: string;
    shortHash: string;
    subject: string;
  } | null>(null);
  let pushRevisionDialog = $state<{
    hash: string;
    shortHash: string;
  } | null>(null);
  let deleteBranchDialog = $state<{ branch: string } | null>(null);
  let contextMenu = $state<{
    hash: string;
    subject: string;
    x: number;
    y: number;
  } | null>(null);
  let tagDialog = $state<{
    mode: 'add' | 'remove';
    hash: string;
    subject: string;
  } | null>(null);
  let errorDialog = $state<{
    title: string;
    message: string;
    details?: string;
    type?: 'error' | 'info';
  } | null>(null);

  function showError(title: string, message: string, details?: string) {
    errorDialog = { title, message, details, type: 'error' };
  }

  function showInfo(title: string, message: string, details?: string) {
    errorDialog = { title, message, details, type: 'info' };
  }
  let showApplyStashDialog = $state(false);
  let stashToApply = $state<{ index: number; message: string } | null>(null);
  let progressMessage = $state<string | null>(null);

  async function withProgress<T>(
    message: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    progressMessage = message;
    try {
      return await fn();
    } finally {
      progressMessage = null;
    }
  }

  const UNCOMMITTED_HASH = '__uncommitted__';

  const uncommittedCommit: Commit = {
    hash: UNCOMMITTED_HASH,
    hashShort: '',
    message: 'Uncommitted changes',
    authorName: '',
    authorEmail: '',
    date: new Date().toISOString(),
    dateRelative: 'now',
    parents: [],
    refs: [],
  };

  let displayCommits = $derived(
    workingStatus?.hasChanges ? [uncommittedCommit, ...commits] : commits,
  );

  let displayGraphRows = $derived.by(() => {
    if (!workingStatus?.hasChanges || graphRows.length === 0) return graphRows;

    const firstRow = graphRows[0];

    // Uncommitted row: gray dot on same lane as HEAD, matching lane count
    const uncommittedRow: GraphRow = {
      segments: [{ type: 'dot', lane: firstRow.commitLane, color: '#858585' }],
      laneCount: firstRow.laneCount,
      commitLane: firstRow.commitLane,
      commitColor: '#858585',
      laneEndsHere: false,
      isNewLane: true, // no line above (top of list)
    };

    // Patch first real row: connect to uncommitted above
    const patchedFirst = { ...firstRow, isNewLane: false };

    return [uncommittedRow, patchedFirst, ...graphRows.slice(1)];
  });

  function appendCommitsAndGraph(newCommits: Commit[]) {
    const result = computeGraphIncremental(newCommits, graphState);
    commits = [...commits, ...newCommits];
    graphRows = [...graphRows, ...result.rows];
    graphState = result.state;
  }

  async function loadCommits(skip = 0) {
    if (loading) return;
    loading = true;
    try {
      const page = await window.electronAPI.git.getCommits({
        maxCount: PAGE_SIZE,
        skip,
        all: showAllBranches,
        logOrder,
      });
      if (page.length < PAGE_SIZE) hasMore = false;
      if (page.length > 0) {
        if (skip === 0) {
          // First page — reset commits, but keep the current selection if
          // it's still visible. Only fall back to the first commit if the
          // existing selection is gone (or never set beyond mocks).
          commits = [];
          graphRows = [];
          graphState = createGraphState();
          const keepSelection =
            isWorkingChangesSelected ||
            (selectedCommit !== null &&
              page.some((c) => c.hashShort === selectedCommit));
          if (!keepSelection) {
            selectedCommit = page[0].hashShort;
          }
        }
        appendCommitsAndGraph(page);
      }
    } catch {
      // Keep mock data on failure
      if (skip === 0) {
        const result = computeGraphIncremental(mockCommits, createGraphState());
        graphRows = result.rows;
        graphState = result.state;
      }
    } finally {
      loading = false;
    }
  }

  function handleLoadMore() {
    if (hasMore && !loading) {
      loadCommits(commits.length);
    }
  }

  function handleToggleAll(all: boolean) {
    settingsStore.update({ graph: { showAllBranches: all } });
    commits = [];
    graphRows = [];
    graphState = createGraphState();
    hasMore = true;
    loadCommits(0);
  }

  function handleToggleLogOrder(order: 'date' | 'topo') {
    settingsStore.update({ graph: { logOrder: order } });
    commits = [];
    graphRows = [];
    graphState = createGraphState();
    hasMore = true;
    loadCommits(0);
  }

  async function loadAllData(opts?: { autoSelect?: boolean }) {
    const autoSelect = opts?.autoSelect ?? true;

    // Sidebar
    try {
      const [branches, remotes, tags, stashes] = await Promise.all([
        window.electronAPI.git.getBranches(),
        window.electronAPI.git.getRemotes(),
        window.electronAPI.git.getTags(),
        window.electronAPI.git.getStashes(),
      ]);
      sidebarData = { branches, remotes, tags, stashes };
    } catch {
      // Keep mock sidebar
    }

    // Working status
    try {
      workingStatus = await window.electronAPI.git.getWorkingStatus();
    } catch {
      workingStatus = null;
    }

    // Detect ongoing merge / rebase / cherry-pick / revert so the banner can
    // surface conflict resolution UI instead of leaving the user stranded.
    try {
      operationInProgress =
        await window.electronAPI.git.getOperationInProgress();
    } catch {
      operationInProgress = null;
    }

    // Commits — reset and load first page
    commits = [];
    graphRows = [];
    graphState = createGraphState();
    hasMore = true;
    await loadCommits(0);

    if (!autoSelect) return;

    // Auto-select priority: working changes > saved resume hash > first commit.
    // If the user has uncommitted work, that's almost always what they want to
    // look at first when they open the app.
    if (workingStatus?.hasChanges) {
      await handleSelectCommit('');
      return;
    }
    const resumeHash = settingsStore.settings.resume.lastSelectedHash;
    if (resumeHash && commits.some((c) => c.hashShort === resumeHash)) {
      await handleSelectCommit(resumeHash);
    }
  }

  async function hydrateSettings() {
    await settingsStore.hydrate();

    // One-time migration of legacy global column widths from localStorage.
    // Only triggers on the first repo opened after upgrading; subsequent repos
    // start with defaults.
    try {
      if (localStorage.getItem(STORAGE_KEY) !== null) {
        const widths = loadWidths(localStorage);
        settingsStore.update({ columns: widths });
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable — skip
    }

    const savedView = settingsStore.settings.resume.lastActiveView;
    if (savedView) activeView = savedView;
  }

  // Tracks which repo the renderer currently believes is open. REPO_CHANGED
  // fires both on actual repo switches (need full re-hydrate + auto-select) and
  // on plain refocus (same repo — preserve selection).
  let currentRepoPath: string | null = null;

  onMount(async () => {
    await hydrateSettings();
    currentRepoPath = await window.electronAPI.repo.getCurrentPath();
    await loadAllData();

    window.electronAPI.repo.onRepoChanged(async (newPath) => {
      const isRepoSwitch = newPath !== currentRepoPath;
      currentRepoPath = newPath;

      if (isRepoSwitch) {
        // Different repo — hydrate per-repo settings and run auto-select.
        await settingsStore.hydrate();
        const savedView = settingsStore.settings.resume.lastActiveView;
        if (savedView) activeView = savedView;
        await loadAllData();
      } else {
        // Same repo (refocus or silent refresh) — refresh data but keep
        // whatever the user has currently selected. Do NOT hydrate settings:
        // a debounced pending write could lose the freshest lastSelectedHash.
        await loadAllData({ autoSelect: false });
      }
    });
  });

  // Persist resume state — guarded so we only write when the value actually changes.
  $effect(() => {
    if (!settingsStore.ready) return;
    const hash = selectedCommit ?? null;
    if (hash !== settingsStore.settings.resume.lastSelectedHash) {
      settingsStore.update({ resume: { lastSelectedHash: hash } });
    }
  });

  $effect(() => {
    if (!settingsStore.ready) return;
    if (activeView !== settingsStore.settings.resume.lastActiveView) {
      settingsStore.update({ resume: { lastActiveView: activeView } });
    }
  });

  async function handleToolbarAction(action: ToolbarAction) {
    if (action === 'commit') {
      await handleViewChange('file-status');
      return;
    }
    if (action === 'branch') {
      branchDialog = {};
      return;
    }

    try {
      switch (action) {
        case 'pull':
          await withProgress('Pulling...', () => window.electronAPI.git.pull());
          break;
        case 'push':
          showPushDialog = true;
          return;
        case 'fetch':
          await withProgress('Fetching...', () =>
            window.electronAPI.git.fetch(),
          );
          break;
        case 'stash':
          showStashDialog = true;
          return;
        case 'show-in-folder':
          await window.electronAPI.git.openRepoFolder();
          return;
        case 'terminal': {
          const res = await window.electronAPI.git.openTerminal();
          if (res?.error) {
            showError('Could not open terminal', res.error);
          }
          return;
        }
        case 'settings':
          await window.electronAPI.appSettings.showWindow();
          return;
        default:
          return;
      }
      await loadAllData();
    } catch (e) {
      console.error(`${action} failed:`, e);
    }
  }

  async function handleViewChange(view: SidebarView) {
    activeView = view;
    if (view === 'file-status') {
      // Refresh working status when entering file status view
      try {
        workingStatus = await window.electronAPI.git.getWorkingStatus();
        // Auto-select first file
        const firstFile = workingStatus.staged[0] ?? workingStatus.unstaged[0];
        if (firstFile) {
          const isStaged = workingStatus.staged.includes(firstFile);
          selectedFile = firstFile.path;
          selectedFileStaged = isStaged;
          await loadWorkingDiff(firstFile.path, isStaged);
        }
      } catch {
        // ignore
      }
    }
  }

  async function handleCommit(
    message: string,
    amend: boolean,
    push: boolean,
    noVerify: boolean,
  ) {
    const stageAll = workingStagingMode === 'none';
    const exclude = stageAll ? Array.from(excludedPaths) : undefined;
    try {
      await withProgress(
        push ? 'Committing and pushing...' : 'Committing...',
        async () => {
          await window.electronAPI.git.commit(message, {
            amend,
            noVerify,
            stageAll,
            exclude,
          });
          if (push) {
            await window.electronAPI.git.push();
          }
        },
      );
      excludedPaths.clear();
      activeView = 'history';
      await loadAllData();
    } catch (e) {
      console.error('Commit failed:', e);
    }
  }

  function handleCancelCommit() {
    activeView = 'history';
  }

  async function handleStashConfirm(message: string, keepStaged: boolean) {
    showStashDialog = false;
    try {
      await withProgress('Creating stash...', () =>
        window.electronAPI.git.stash(
          message || undefined,
          keepStaged || undefined,
        ),
      );
      await loadAllData();
    } catch (e) {
      console.error('Stash failed:', e);
    }
  }

  function handleApplyStashRequest(index: number, message: string) {
    stashToApply = { index, message };
    showApplyStashDialog = true;
  }

  async function handleApplyStashConfirm(deleteAfter: boolean) {
    showApplyStashDialog = false;
    if (!stashToApply) return;
    try {
      const result = await withProgress('Applying stash...', () =>
        window.electronAPI.git.applyStash(stashToApply!.index, deleteAfter),
      );
      if (result?.conflicts?.length > 0) {
        showError(
          'Stash Conflicts',
          'Stash applied with merge conflicts. Resolve manually.',
          result.conflicts.join('\n'),
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Apply stash failed:', msg);
      showError('Apply Stash Failed', 'Could not apply stash.', msg);
    }
    stashToApply = null;
    await loadAllData();
  }

  async function handleSelectCommit(hash: string) {
    selectedCommit = hash;

    if (hash === '' && workingStatus?.hasChanges) {
      // Uncommitted changes selected
      isWorkingChangesSelected = true;
      selectedCommitFullHash = null;
      changedFiles = [];
      // Auto-select first file from staged or unstaged
      const firstFile = workingStatus.staged[0] ?? workingStatus.unstaged[0];
      if (firstFile) {
        const isStaged = workingStatus.staged.includes(firstFile);
        selectedFile = firstFile.path;
        selectedFileStaged = isStaged;
        await loadWorkingDiff(firstFile.path, isStaged);
      } else {
        selectedFile = null;
        currentDiff = null;
      }
      return;
    }

    isWorkingChangesSelected = false;
    const commit = commits.find((c) => c.hashShort === hash);
    selectedCommitFullHash = commit?.hash ?? null;
    selectedCommitData = commit ?? null;
    if (commit) {
      try {
        const [files, body] = await Promise.all([
          window.electronAPI.git.getCommitFiles(commit.hash),
          window.electronAPI.git.getCommitBody(commit.hash),
        ]);
        changedFiles = files;
        commitBody = body;
        selectedFile = changedFiles[0]?.path ?? null;
        selectedFileStaged = false;
        if (selectedFile) {
          await loadFileDiff(commit.hash, selectedFile);
        } else {
          currentDiff = null;
        }
      } catch {
        changedFiles = [];
        commitBody = '';
        currentDiff = null;
      }
    }
  }

  function handleSelectParent(parentHash: string) {
    const idx = displayCommits.findIndex((c) => c.hash === parentHash);
    if (idx >= 0) {
      scrollToIndex = idx;
      handleSelectCommit(displayCommits[idx].hashShort);
    }
  }

  function handleScrollToBranch(branchName: string) {
    const idx = displayCommits.findIndex((c) =>
      c.refs.some((r) => r.includes(branchName)),
    );
    if (idx >= 0) {
      scrollToIndex = idx;
      handleSelectCommit(displayCommits[idx].hashShort);
    }
  }

  async function loadFileDiff(commitHash: string, filePath: string) {
    try {
      currentDiff = await window.electronAPI.git.getFileDiff(
        commitHash,
        filePath,
      );
    } catch {
      currentDiff = null;
    }
  }

  async function loadWorkingDiff(filePath: string, staged: boolean) {
    try {
      currentDiff = await window.electronAPI.git.getWorkingDiff(
        filePath,
        staged,
      );
    } catch {
      currentDiff = null;
    }
  }

  async function handleSelectFile(path: string, staged = false) {
    selectedFile = path;
    selectedFileStaged = staged;
    if (activeView === 'file-status' || isWorkingChangesSelected) {
      await loadWorkingDiff(path, staged);
    } else if (selectedCommitFullHash) {
      await loadFileDiff(selectedCommitFullHash, path);
    }
  }

  async function handleStageFile(path: string, stage: boolean) {
    try {
      if (stage) {
        await window.electronAPI.git.stageFile(path);
      } else {
        await window.electronAPI.git.unstageFile(path);
      }
      // Refresh working status
      workingStatus = await window.electronAPI.git.getWorkingStatus();
    } catch (e) {
      console.error('Stage/unstage failed:', e);
    }
  }

  async function handleStageAll() {
    try {
      await withProgress('Staging all files...', () =>
        window.electronAPI.git.stageAll(),
      );
      workingStatus = await window.electronAPI.git.getWorkingStatus();
    } catch (e) {
      console.error('Stage all failed:', e);
    }
  }

  async function handleUnstageAll() {
    try {
      await withProgress('Unstaging all files...', () =>
        window.electronAPI.git.unstageAll(),
      );
      workingStatus = await window.electronAPI.git.getWorkingStatus();
    } catch (e) {
      console.error('Unstage all failed:', e);
    }
  }

  async function handleCreateBranch(
    name: string,
    startPoint: string | undefined,
    checkout: boolean,
  ) {
    branchDialog = null;
    try {
      await withProgress('Creating branch...', async () => {
        await window.electronAPI.git.createBranch(name, startPoint);
        if (checkout) {
          await window.electronAPI.git.checkout(name);
        }
      });
      await loadAllData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError(
        'Create Branch Failed',
        `Could not create branch '${name}'.`,
        msg,
      );
    }
  }

  async function handlePushAction(action: PushAction) {
    showPushDialog = false;
    try {
      await withProgress('Pushing...', () =>
        window.electronAPI.git.pushBranches(
          action.remote,
          action.branches,
          action.includeTags,
        ),
      );
      await loadAllData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Push Failed', `Could not push to '${action.remote}'.`, msg);
    }
  }

  async function handleTagAction(action: TagAction) {
    tagDialog = null;
    if (action.mode === 'add') {
      try {
        await withProgress('Creating tag...', async () => {
          await window.electronAPI.git.createTag(action.name, action.commit, {
            message: action.message,
            force: action.force,
          });
          if (action.pushTo) {
            await window.electronAPI.git.pushTag(action.name, action.pushTo);
          }
        });
        await loadAllData();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showError('Add Tag Failed', `Could not add tag '${action.name}'.`, msg);
      }
    } else {
      try {
        await withProgress('Removing tag...', async () => {
          await window.electronAPI.git.deleteTag(action.name);
          if (action.removeFromRemote) {
            await window.electronAPI.git.deleteRemoteTag(
              action.name,
              action.removeFromRemote,
            );
          }
        });
        await loadAllData();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showError(
          'Remove Tag Failed',
          `Could not remove tag '${action.name}'.`,
          msg,
        );
      }
    }
  }

  async function handleCheckoutBranch(name: string) {
    try {
      await withProgress(`Checking out ${name}...`, () =>
        window.electronAPI.git.checkout(name),
      );
      await loadAllData();
    } catch (e) {
      console.error('Checkout failed:', e);
    }
  }

  async function handleCheckoutRemoteBranch(
    _remoteName: string,
    branch: string,
  ) {
    try {
      await withProgress(`Checking out ${branch}...`, () =>
        window.electronAPI.git.checkout(branch),
      );
      await loadAllData();
    } catch (e) {
      console.error('Checkout remote failed:', e);
    }
  }

  async function handleMergeBranch(name: string) {
    errorDialog = null;
    const current =
      sidebarData.branches.find((b) => b.current)?.name ?? 'current';
    if (!confirm(`Merge '${name}' into '${current}'?`)) return;
    const result = await withProgress(`Merging ${name}...`, () =>
      window.electronAPI.git.merge(name),
    );
    if (result?.error) {
      showError('Merge Failed', `Could not merge '${name}'.`, result.error);
    } else if (result?.conflicts?.length > 0) {
      showError(
        'Merge Conflicts',
        `Merge of '${name}' produced conflicts. Resolve manually.`,
        result.conflicts.join('\n'),
      );
    } else {
      showInfo(
        'Merge Complete',
        `Merged '${name}' into '${current}'.`,
        result.summary,
      );
    }
    await loadAllData();
  }

  async function handleRebaseBranch(name: string) {
    errorDialog = null;
    const current =
      sidebarData.branches.find((b) => b.current)?.name ?? 'current';
    if (!confirm(`Rebase '${current}' onto '${name}'?`)) return;
    const result = await withProgress(`Rebasing onto ${name}...`, () =>
      window.electronAPI.git.rebase(name),
    );
    if (result?.error) {
      showError(
        'Rebase Failed',
        `Could not rebase onto '${name}'.`,
        result.error,
      );
    } else if (result?.conflicts?.length > 0) {
      showError(
        'Rebase Conflicts',
        `Rebase onto '${name}' produced conflicts. Resolve manually.`,
        result.conflicts.join('\n'),
      );
    } else {
      showInfo(
        'Rebase Complete',
        `Rebased '${current}' onto '${name}'.`,
        result.summary,
      );
    }
    await loadAllData();
  }

  async function handleOpenFile(filePath: string) {
    try {
      await window.electronAPI.git.openFile(filePath);
    } catch (e) {
      console.error('Open file failed:', e);
    }
  }

  async function handleDiscardFile(
    filePath: string,
    status: import('./types').FileStatus,
    _staged: boolean,
  ) {
    if (!confirm(`Discard changes to '${filePath}'?`)) return;
    try {
      // Untracked or newly added (staged A) — delete the file
      const isUntracked = status === '?' || status === 'A';
      await withProgress('Discarding changes...', () =>
        window.electronAPI.git.discardFile(filePath, isUntracked),
      );
      workingStatus = await window.electronAPI.git.getWorkingStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Discard Failed', `Could not discard '${filePath}'.`, msg);
    }
  }

  async function handleIgnoreFile(filePath: string) {
    try {
      await withProgress('Ignoring file...', () =>
        window.electronAPI.git.ignoreFile(filePath),
      );
      workingStatus = await window.electronAPI.git.getWorkingStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Ignore Failed', `Could not ignore '${filePath}'.`, msg);
    }
  }

  async function handleDiscardFiles(
    files: Array<{
      path: string;
      status: import('./types').FileStatus;
      staged: boolean;
    }>,
  ) {
    if (!confirm(`Discard changes to ${files.length} files?`)) return;
    try {
      await withProgress(`Discarding ${files.length} files...`, async () => {
        for (const f of files) {
          const isUntracked = f.status === '?' || f.status === 'A';
          await window.electronAPI.git.discardFile(f.path, isUntracked);
        }
      });
      workingStatus = await window.electronAPI.git.getWorkingStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Discard Failed', 'Could not discard files.', msg);
    }
  }

  async function handleIgnoreFiles(paths: string[]) {
    try {
      await withProgress(`Ignoring ${paths.length} files...`, async () => {
        for (const p of paths) {
          await window.electronAPI.git.ignoreFile(p);
        }
      });
      workingStatus = await window.electronAPI.git.getWorkingStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Ignore Failed', 'Could not ignore files.', msg);
    }
  }

  async function handleCreatePatch(filePath: string, staged: boolean) {
    try {
      await window.electronAPI.git.createPatch(filePath, staged);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError(
        'Create Patch Failed',
        `Could not create patch for '${filePath}'.`,
        msg,
      );
    }
  }

  async function refreshAfterPatch() {
    workingStatus = await window.electronAPI.git.getWorkingStatus();
    if (selectedFile) {
      await loadWorkingDiff(selectedFile, selectedFileStaged);
    }
  }

  async function handleStageHunk(hunkIndex: number) {
    if (!selectedFile) return;
    try {
      await window.electronAPI.git.stageHunk(selectedFile, hunkIndex);
      await refreshAfterPatch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Stage Hunk Failed', 'Could not stage hunk.', msg);
    }
  }

  async function handleUnstageHunk(hunkIndex: number) {
    if (!selectedFile) return;
    try {
      await window.electronAPI.git.unstageHunk(selectedFile, hunkIndex);
      await refreshAfterPatch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Unstage Hunk Failed', 'Could not unstage hunk.', msg);
    }
  }

  async function handleStageLines(hunkIndex: number, lineIndices: number[]) {
    if (!selectedFile) return;
    try {
      await window.electronAPI.git.stageLines(
        selectedFile,
        hunkIndex,
        lineIndices,
      );
      await refreshAfterPatch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Stage Lines Failed', 'Could not stage selected lines.', msg);
    }
  }

  async function handleUnstageLines(hunkIndex: number, lineIndices: number[]) {
    if (!selectedFile) return;
    try {
      await window.electronAPI.git.unstageLines(
        selectedFile,
        hunkIndex,
        lineIndices,
      );
      await refreshAfterPatch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError(
        'Unstage Lines Failed',
        'Could not unstage selected lines.',
        msg,
      );
    }
  }

  async function handleDiscardLines(hunkIndex: number, lineIndices: number[]) {
    if (!selectedFile) return;
    if (!confirm(`Discard ${lineIndices.length} selected line(s)?`)) return;
    try {
      await window.electronAPI.git.discardLines(
        selectedFile,
        hunkIndex,
        lineIndices,
      );
      await refreshAfterPatch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError(
        'Discard Lines Failed',
        'Could not discard selected lines.',
        msg,
      );
    }
  }

  async function handleCheckoutCommit(hash: string) {
    try {
      await withProgress('Checking out commit...', () =>
        window.electronAPI.git.checkout(hash),
      );
      await loadAllData();
    } catch (e) {
      console.error('Checkout failed:', e);
    }
  }

  async function handleResetToCommit(hash: string, mode: ResetMode) {
    resetDialog = null;
    errorDialog = null;
    try {
      await withProgress(`Resetting to ${hash.slice(0, 7)}...`, () =>
        window.electronAPI.git.resetToCommit(hash, mode),
      );
      await loadAllData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Reset Failed', 'Could not reset to this commit.', msg);
    }
  }

  async function handleRevertCommit(hash: string) {
    revertDialog = null;
    errorDialog = null;
    const result = await withProgress(`Reverting ${hash.slice(0, 7)}...`, () =>
      window.electronAPI.git.revertCommit(hash),
    );
    if (result?.error) {
      showError('Revert Failed', 'Could not revert commit.', result.error);
    } else if (result?.conflicts?.length > 0) {
      showError(
        'Revert Conflicts',
        'Revert produced conflicts. Resolve manually.',
        result.conflicts.join('\n'),
      );
    }
    await loadAllData();
  }

  async function handleCherryPick(hash: string) {
    cherryPickDialog = null;
    errorDialog = null;
    const result = await withProgress(
      `Cherry-picking ${hash.slice(0, 7)}...`,
      () => window.electronAPI.git.cherryPick(hash),
    );
    if (result?.error) {
      showError(
        'Cherry-pick Failed',
        'Could not cherry-pick commit.',
        result.error,
      );
    } else if (result?.conflicts?.length > 0) {
      showError(
        'Cherry-pick Conflicts',
        'Cherry-pick produced conflicts. Resolve manually.',
        result.conflicts.join('\n'),
      );
    }
    await loadAllData();
  }

  async function handleArchiveCommit(hash: string, shortHash: string) {
    try {
      await withProgress('Creating archive...', () =>
        window.electronAPI.git.archiveCommit(hash, `${shortHash}.zip`),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Archive Failed', 'Could not create archive.', msg);
    }
  }

  async function handleCreatePatchFromCommit(hash: string, shortHash: string) {
    try {
      await withProgress('Creating patch...', () =>
        window.electronAPI.git.createPatchFromCommit(
          hash,
          `${shortHash}.patch`,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Create Patch Failed', 'Could not create patch.', msg);
    }
  }

  async function handlePushRevision(
    hash: string,
    opts: { remote: string; branch: string; force: boolean },
  ) {
    pushRevisionDialog = null;
    errorDialog = null;
    try {
      await withProgress(
        `Pushing ${hash.slice(0, 7)} to ${opts.remote}/${opts.branch}...`,
        () =>
          window.electronAPI.git.pushRevision(
            opts.remote,
            hash,
            opts.branch,
            opts.force,
          ),
      );
      await loadAllData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Push Revision Failed', 'Could not push revision.', msg);
    }
  }

  async function handleResolveConflict(
    filePath: string,
    strategy: 'mine' | 'theirs',
  ) {
    const res = await window.electronAPI.git.resolveConflict(
      filePath,
      strategy,
    );
    if (res?.error) {
      showError('Resolve conflict failed', res.error);
    }
    await loadAllData({ autoSelect: false });
  }

  async function handleMarkResolved(filePath: string) {
    const res = await window.electronAPI.git.markResolved(filePath);
    if (res?.error) {
      showError('Mark resolved failed', res.error);
    }
    await loadAllData({ autoSelect: false });
  }

  async function handleMarkUnresolved(filePath: string) {
    const res = await window.electronAPI.git.markUnresolved(filePath);
    if (res?.error) {
      showError('Mark unresolved failed', res.error);
    }
    await loadAllData({ autoSelect: false });
  }

  async function handleAbortOperation() {
    const res = await window.electronAPI.git.abortOperation();
    if (res?.error) {
      showError('Abort failed', res.error);
      return;
    }
    await loadAllData();
  }

  async function handleSearchSelect(commit: Commit) {
    selectedCommit = commit.hashShort;
    isWorkingChangesSelected = false;
    selectedCommitFullHash = commit.hash;
    selectedCommitData = commit;
    try {
      const [files, body] = await Promise.all([
        window.electronAPI.git.getCommitFiles(commit.hash),
        window.electronAPI.git.getCommitBody(commit.hash),
      ]);
      changedFiles = files;
      commitBody = body;
      const firstFile = files[0];
      if (firstFile) {
        selectedFile = firstFile.path;
        currentDiff = await window.electronAPI.git.getFileDiff(
          commit.hash,
          firstFile.path,
        );
      } else {
        selectedFile = null;
        currentDiff = null;
      }
    } catch (e) {
      console.error('[search] load commit failed:', e);
    }
  }

  async function handleDeleteBranch(name: string, force: boolean) {
    deleteBranchDialog = null;
    const res = await window.electronAPI.git.deleteBranch(name, force);
    if (res?.error) {
      showError('Delete branch failed', res.error);
      return;
    }
    await loadAllData();
  }

  async function handleContinueOperation() {
    const res = await withProgress('Continuing...', () =>
      window.electronAPI.git.continueOperation(),
    );
    if (res?.error) {
      showError('Continue failed', res.error);
      return;
    }
    await loadAllData();
  }

  async function handleCopyShaToClipboard(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
    } catch (e) {
      console.error('Clipboard copy failed:', e);
    }
  }
</script>

<div class="app-shell">
  <TopToolbar
    onAction={handleToolbarAction}
    uncommittedCount={(workingStatus?.staged.length ?? 0) +
      (workingStatus?.unstaged.length ?? 0)}
    aheadCount={sidebarData.branches.find((b) => b.current)?.ahead ?? 0}
    behindCount={sidebarData.branches.find((b) => b.current)?.behind ?? 0}
  />

  {#if operationInProgress}
    <ConflictBanner
      kind={operationInProgress.kind}
      conflictCount={(workingStatus?.unstaged ?? []).filter(
        (f) => f.status === 'U',
      ).length}
      onAbort={handleAbortOperation}
      onContinue={handleContinueOperation}
    />
  {/if}

  <div class="main-area">
    <div class="sidebar-panel" style="width:{sidebarWidth}px">
      <LeftSidebar
        data={sidebarData}
        currentBranch={sidebarData.branches.find((b) => b.current)?.name ??
          null}
        {activeView}
        onViewChange={handleViewChange}
        onCheckoutBranch={handleCheckoutBranch}
        onCheckoutRemoteBranch={handleCheckoutRemoteBranch}
        onApplyStash={handleApplyStashRequest}
        onMergeBranch={handleMergeBranch}
        onRebaseBranch={handleRebaseBranch}
        onDeleteBranch={(name) => (deleteBranchDialog = { branch: name })}
        onNewBranch={() => (branchDialog = {})}
        onScrollToBranch={handleScrollToBranch}
      />
    </div>

    <Splitter direction="horizontal" onResize={resizeSidebar} />

    <div class="content-area">
      {#if activeView === 'file-status'}
        <!-- File Status / Commit view -->
        <div class="staging-area">
          <div class="staging-top">
            <div class="filelist-panel" style="width:{fileListWidth}px">
              <FileList
                files={[]}
                {workingStatus}
                isWorkingChanges={true}
                selectedPath={selectedFile}
                viewMode={workingViewMode}
                sortMode={workingSortMode}
                statusFilter={workingStatusFilter}
                stagingMode={workingStagingMode}
                {excludedPaths}
                onSelectFile={handleSelectFile}
                onStageFile={handleStageFile}
                onOpenFile={handleOpenFile}
                onDiscardFile={handleDiscardFile}
                onIgnoreFile={handleIgnoreFile}
                onCreatePatch={handleCreatePatch}
                onDiscardFiles={handleDiscardFiles}
                onIgnoreFiles={handleIgnoreFiles}
                onStageAll={handleStageAll}
                onUnstageAll={handleUnstageAll}
                onResolveConflict={handleResolveConflict}
                onMarkResolved={handleMarkResolved}
                onMarkUnresolved={handleMarkUnresolved}
                onViewMode={setWorkingViewMode}
                onSortMode={setWorkingSortMode}
                onStatusFilter={setWorkingStatusFilter}
                onStagingMode={setWorkingStagingMode}
                onToggleExclude={toggleExclude}
              />
            </div>

            <Splitter direction="horizontal" onResize={resizeFileList} />

            <div class="diff-panel">
              <DiffViewer
                diff={currentDiff}
                isWorkingChanges={true}
                isStaged={selectedFileStaged}
                onStageHunk={handleStageHunk}
                onUnstageHunk={handleUnstageHunk}
                onStageLines={handleStageLines}
                onUnstageLines={handleUnstageLines}
                onDiscardLines={handleDiscardLines}
              />
            </div>
          </div>

          <CommitPanel
            currentBranch={sidebarData.branches.find((b) => b.current)?.name ??
              null}
            stagingMode={workingStagingMode}
            onCommit={handleCommit}
            onCancel={handleCancelCommit}
          />
        </div>
      {:else if activeView === 'search'}
        <!-- Search view: filter bar + result list (top) reuses bottom file/diff panes -->
        <div class="commit-log-panel" style="height:{commitLogHeight}px">
          <SearchView
            selectedHash={selectedCommit}
            onSelect={handleSearchSelect}
          />
        </div>

        <Splitter direction="vertical" onResize={resizeCommitLog} />

        <div class="bottom-area">
          <div class="filelist-panel" style="width:{fileListWidth}px">
            <FileList
              files={changedFiles}
              {workingStatus}
              isWorkingChanges={false}
              selectedPath={selectedFile}
              selectedCommit={selectedCommitData}
              {commitBody}
              viewMode={historicalViewMode}
              sortMode={historicalSortMode}
              onSelectFile={handleSelectFile}
              onSelectParent={handleSelectParent}
              onOpenFile={handleOpenFile}
              onViewMode={setHistoricalViewMode}
              onSortMode={setHistoricalSortMode}
            />
          </div>

          <Splitter direction="horizontal" onResize={resizeFileList} />

          <div class="diff-panel">
            <DiffViewer diff={currentDiff} />
          </div>
        </div>
      {:else}
        <!-- History view -->
        <div class="commit-log-panel" style="height:{commitLogHeight}px">
          <CommitLog
            commits={displayCommits}
            graphRows={displayGraphRows}
            selectedHash={selectedCommit}
            onSelectCommit={handleSelectCommit}
            onLoadMore={handleLoadMore}
            {hasMore}
            {loading}
            showAll={showAllBranches}
            onToggleAll={handleToggleAll}
            {logOrder}
            onToggleLogOrder={handleToggleLogOrder}
            onCheckoutCommit={handleCheckoutCommit}
            onCommitContextMenu={(hash, subject, x, y) =>
              (contextMenu = { hash, subject, x, y })}
            {scrollToIndex}
          />
        </div>

        <Splitter direction="vertical" onResize={resizeCommitLog} />

        <div class="bottom-area">
          <div class="filelist-panel" style="width:{fileListWidth}px">
            <FileList
              files={changedFiles}
              {workingStatus}
              isWorkingChanges={isWorkingChangesSelected}
              selectedPath={selectedFile}
              selectedCommit={selectedCommitData}
              {commitBody}
              viewMode={historyContextViewMode}
              sortMode={historyContextSortMode}
              statusFilter={workingStatusFilter}
              stagingMode={workingStagingMode}
              {excludedPaths}
              onSelectFile={handleSelectFile}
              onStageFile={handleStageFile}
              onSelectParent={handleSelectParent}
              onOpenFile={handleOpenFile}
              onDiscardFile={handleDiscardFile}
              onIgnoreFile={handleIgnoreFile}
              onCreatePatch={handleCreatePatch}
              onDiscardFiles={handleDiscardFiles}
              onIgnoreFiles={handleIgnoreFiles}
              onStageAll={handleStageAll}
              onUnstageAll={handleUnstageAll}
              onResolveConflict={handleResolveConflict}
              onMarkResolved={handleMarkResolved}
              onMarkUnresolved={handleMarkUnresolved}
              onViewMode={setHistoryContextViewMode}
              onSortMode={setHistoryContextSortMode}
              onStatusFilter={setWorkingStatusFilter}
              onStagingMode={setWorkingStagingMode}
              onToggleExclude={toggleExclude}
            />
          </div>

          <Splitter direction="horizontal" onResize={resizeFileList} />

          <div class="diff-panel">
            <DiffViewer
              diff={currentDiff}
              isWorkingChanges={isWorkingChangesSelected}
              isStaged={selectedFileStaged}
              onStageHunk={handleStageHunk}
              onUnstageHunk={handleUnstageHunk}
              onStageLines={handleStageLines}
              onUnstageLines={handleUnstageLines}
              onDiscardLines={handleDiscardLines}
            />
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

{#if branchDialog}
  <CreateBranchDialog
    currentBranch={sidebarData.branches.find((b) => b.current)?.name ?? 'main'}
    initialStartPoint={branchDialog.startPoint}
    onConfirm={handleCreateBranch}
    onCancel={() => (branchDialog = null)}
  />
{/if}

{#if showPushDialog}
  <PushDialog
    branches={sidebarData.branches}
    remotes={sidebarData.remotes}
    onConfirm={handlePushAction}
    onCancel={() => (showPushDialog = false)}
  />
{/if}

{#if contextMenu}
  {@const menu = contextMenu}
  {@const currentBr = sidebarData.branches.find((b) => b.current)}
  {@const branchName = currentBr?.name ?? null}
  {@const isHead = currentBr ? menu.hash.startsWith(currentBr.commit) : false}
  {@const hasRemotes = sidebarData.remotes.length > 0}
  {@const shortHash = menu.hash.slice(0, 7)}
  {@const resetLabel = branchName
    ? `Reset ${branchName} to this commit…`
    : 'Reset to this commit…'}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    items={[
      {
        label: 'Checkout',
        disabled: isHead,
        onSelect: () => handleCheckoutCommit(menu.hash),
      },
      {
        label: 'Push revision…',
        disabled: !hasRemotes,
        onSelect: () => {
          pushRevisionDialog = { hash: menu.hash, shortHash };
        },
      },
      {
        label: 'Merge…',
        disabled: isHead,
        onSelect: () => handleMergeBranch(menu.hash),
      },
      { label: 'Rebase…', onSelect: () => handleRebaseBranch(menu.hash) },
      { separator: true },
      {
        label: 'Tag…',
        onSelect: () => {
          tagDialog = {
            mode: 'add',
            hash: menu.hash,
            subject: menu.subject,
          };
        },
      },
      {
        label: 'Branch…',
        onSelect: () => {
          branchDialog = { startPoint: menu.hash };
        },
      },
      { separator: true },
      {
        label: resetLabel,
        disabled: !branchName,
        onSelect: () => {
          resetDialog = {
            hash: menu.hash,
            shortHash,
            subject: menu.subject,
            branch: branchName ?? '',
          };
        },
      },
      {
        label: 'Reverse commit…',
        onSelect: () => {
          revertDialog = {
            hash: menu.hash,
            shortHash,
            subject: menu.subject,
          };
        },
      },
      {
        label: 'Create Patch…',
        onSelect: () => handleCreatePatchFromCommit(menu.hash, shortHash),
      },
      {
        label: 'Cherry Pick',
        disabled: isHead,
        onSelect: () => {
          cherryPickDialog = {
            hash: menu.hash,
            shortHash,
            subject: menu.subject,
          };
        },
      },
      {
        label: 'Archive…',
        onSelect: () => handleArchiveCommit(menu.hash, shortHash),
      },
      { separator: true },
      {
        label: 'Copy SHA-1 to Clipboard',
        onSelect: () => handleCopyShaToClipboard(menu.hash),
      },
    ]}
    onClose={() => (contextMenu = null)}
  />
{/if}

{#if tagDialog}
  <AddTagDialog
    initialMode={tagDialog.mode}
    commitHash={tagDialog.hash}
    commitSubject={tagDialog.subject}
    tags={sidebarData.tags}
    remotes={sidebarData.remotes}
    onConfirm={handleTagAction}
    onCancel={() => (tagDialog = null)}
  />
{/if}

{#if resetDialog}
  <ResetCommitDialog
    branch={resetDialog.branch}
    shortHash={resetDialog.shortHash}
    subject={resetDialog.subject}
    onConfirm={(mode) =>
      resetDialog && handleResetToCommit(resetDialog.hash, mode)}
    onCancel={() => (resetDialog = null)}
  />
{/if}

{#if revertDialog}
  <RevertCommitDialog
    shortHash={revertDialog.shortHash}
    subject={revertDialog.subject}
    onConfirm={() => revertDialog && handleRevertCommit(revertDialog.hash)}
    onCancel={() => (revertDialog = null)}
  />
{/if}

{#if cherryPickDialog}
  <CherryPickDialog
    shortHash={cherryPickDialog.shortHash}
    subject={cherryPickDialog.subject}
    targetBranch={sidebarData.branches.find((b) => b.current)?.name ?? null}
    onConfirm={() =>
      cherryPickDialog && handleCherryPick(cherryPickDialog.hash)}
    onCancel={() => (cherryPickDialog = null)}
  />
{/if}

{#if pushRevisionDialog}
  <PushRevisionDialog
    shortHash={pushRevisionDialog.shortHash}
    remotes={sidebarData.remotes}
    defaultBranch={sidebarData.branches.find((b) => b.current)?.name ?? ''}
    onConfirm={(opts) =>
      pushRevisionDialog && handlePushRevision(pushRevisionDialog.hash, opts)}
    onCancel={() => (pushRevisionDialog = null)}
  />
{/if}

{#if deleteBranchDialog}
  <DeleteBranchDialog
    branch={deleteBranchDialog.branch}
    onConfirm={(force) =>
      deleteBranchDialog &&
      handleDeleteBranch(deleteBranchDialog.branch, force)}
    onCancel={() => (deleteBranchDialog = null)}
  />
{/if}

{#if showStashDialog}
  <StashDialog
    onConfirm={handleStashConfirm}
    onCancel={() => (showStashDialog = false)}
  />
{/if}

{#if showApplyStashDialog && stashToApply}
  <ApplyStashDialog
    stashMessage={stashToApply.message}
    onConfirm={handleApplyStashConfirm}
    onCancel={() => {
      showApplyStashDialog = false;
      stashToApply = null;
    }}
  />
{/if}

{#if errorDialog}
  <ErrorDialog
    title={errorDialog.title}
    message={errorDialog.message}
    details={errorDialog.details}
    type={errorDialog.type}
    onClose={() => (errorDialog = null)}
  />
{/if}

{#if progressMessage}
  <ProgressDialog message={progressMessage} />
{/if}

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100vh;
    overflow: hidden;
  }

  .main-area {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .sidebar-panel {
    flex-shrink: 0;
    overflow: hidden;
  }

  .content-area {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  .commit-log-panel {
    flex-shrink: 0;
    overflow: hidden;
  }

  .staging-area {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  .staging-top {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .bottom-area {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .filelist-panel {
    flex-shrink: 0;
    overflow: hidden;
  }

  .diff-panel {
    flex: 1;
    overflow: hidden;
  }
</style>
