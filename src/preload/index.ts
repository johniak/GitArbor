import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type {
  DeepPartial,
  ElectronAPI,
  GetCommitsRequest,
  RepoSettings,
  AppSettings,
  SearchCommitsRequest,
  AIDownloadOpts,
  AIInferRequest,
  AITokenEvent,
  AIStateEvent,
} from '../shared/ipc';

const api: ElectronAPI = {
  git: {
    getBranches: () => ipcRenderer.invoke(IPC.GIT_GET_BRANCHES),
    getRemotes: () => ipcRenderer.invoke(IPC.GIT_GET_REMOTES),
    getTags: () => ipcRenderer.invoke(IPC.GIT_GET_TAGS),
    getStashes: () => ipcRenderer.invoke(IPC.GIT_GET_STASHES),
    getCommits: (opts?: GetCommitsRequest) =>
      ipcRenderer.invoke(IPC.GIT_GET_COMMITS, opts),
    getCommitBody: (hash: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_COMMIT_BODY, hash),
    getCommitFiles: (hash: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_COMMIT_FILES, hash),
    getFileDiff: (hash: string, filePath: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_FILE_DIFF, { hash, filePath }),
    getWorkingStatus: () => ipcRenderer.invoke(IPC.GIT_GET_WORKING_STATUS),
    getWorkingDiff: (filePath: string, staged: boolean) =>
      ipcRenderer.invoke(IPC.GIT_GET_WORKING_DIFF, { filePath, staged }),
    stageFile: (path: string) => ipcRenderer.invoke(IPC.GIT_STAGE_FILE, path),
    unstageFile: (path: string) =>
      ipcRenderer.invoke(IPC.GIT_UNSTAGE_FILE, path),
    stageAll: () => ipcRenderer.invoke(IPC.GIT_STAGE_ALL),
    unstageAll: () => ipcRenderer.invoke(IPC.GIT_UNSTAGE_ALL),
    commit: (
      message: string,
      opts?: {
        amend?: boolean;
        noVerify?: boolean;
        stageAll?: boolean;
        exclude?: string[];
      },
    ) => ipcRenderer.invoke(IPC.GIT_COMMIT, { message, ...(opts ?? {}) }),
    pull: () => ipcRenderer.invoke(IPC.GIT_PULL),
    push: () => ipcRenderer.invoke(IPC.GIT_PUSH),
    pushBranches: (
      remote: string,
      branches: Array<{
        local: string;
        remote?: string;
        setUpstream?: boolean;
      }>,
      includeTags?: boolean,
    ) =>
      ipcRenderer.invoke(IPC.GIT_PUSH_BRANCHES, {
        remote,
        branches,
        includeTags,
      }),
    fetch: () => ipcRenderer.invoke(IPC.GIT_FETCH),
    stash: (message?: string, keepIndex?: boolean) =>
      ipcRenderer.invoke(IPC.GIT_STASH, { message, keepIndex }),
    applyStash: (index: number, drop: boolean) =>
      ipcRenderer.invoke(IPC.GIT_APPLY_STASH, { index, drop }),
    merge: (branch: string) => ipcRenderer.invoke(IPC.GIT_MERGE, branch),
    rebase: (branch: string) => ipcRenderer.invoke(IPC.GIT_REBASE, branch),
    getConfig: (key: string) => ipcRenderer.invoke(IPC.GIT_GET_CONFIG, key),
    checkout: (target: string) => ipcRenderer.invoke(IPC.GIT_CHECKOUT, target),
    createBranch: (name: string, startPoint?: string) =>
      ipcRenderer.invoke(IPC.GIT_CREATE_BRANCH, { name, startPoint }),
    deleteBranch: (name: string, force: boolean) =>
      ipcRenderer.invoke(IPC.GIT_DELETE_BRANCH, { name, force }),
    searchCommits: (request: SearchCommitsRequest) =>
      ipcRenderer.invoke(IPC.GIT_SEARCH_COMMITS, request),
    createTag: (
      name: string,
      commit: string,
      opts?: { message?: string; force?: boolean },
    ) => ipcRenderer.invoke(IPC.GIT_CREATE_TAG, { name, commit, opts }),
    deleteTag: (name: string) => ipcRenderer.invoke(IPC.GIT_DELETE_TAG, name),
    pushTag: (name: string, remote: string) =>
      ipcRenderer.invoke(IPC.GIT_PUSH_TAG, { name, remote }),
    deleteRemoteTag: (name: string, remote: string) =>
      ipcRenderer.invoke(IPC.GIT_DELETE_REMOTE_TAG, { name, remote }),
    discardFile: (path: string, isUntracked: boolean) =>
      ipcRenderer.invoke(IPC.GIT_DISCARD_FILE, { path, isUntracked }),
    ignoreFile: (path: string) => ipcRenderer.invoke(IPC.GIT_IGNORE_FILE, path),
    openFile: (path: string) => ipcRenderer.invoke(IPC.SHELL_OPEN_FILE, path),
    openRepoFolder: () => ipcRenderer.invoke(IPC.SHELL_OPEN_REPO_FOLDER),
    openTerminal: () => ipcRenderer.invoke(IPC.SHELL_OPEN_TERMINAL),
    createPatch: (filePath: string, staged: boolean) =>
      ipcRenderer.invoke(IPC.GIT_CREATE_PATCH, { filePath, staged }),
    stageHunk: (filePath: string, hunkIndex: number) =>
      ipcRenderer.invoke(IPC.GIT_STAGE_HUNK, { filePath, hunkIndex }),
    unstageHunk: (filePath: string, hunkIndex: number) =>
      ipcRenderer.invoke(IPC.GIT_UNSTAGE_HUNK, { filePath, hunkIndex }),
    stageLines: (filePath: string, hunkIndex: number, lineIndices: number[]) =>
      ipcRenderer.invoke(IPC.GIT_STAGE_LINES, {
        filePath,
        hunkIndex,
        lineIndices,
      }),
    unstageLines: (
      filePath: string,
      hunkIndex: number,
      lineIndices: number[],
    ) =>
      ipcRenderer.invoke(IPC.GIT_UNSTAGE_LINES, {
        filePath,
        hunkIndex,
        lineIndices,
      }),
    discardLines: (
      filePath: string,
      hunkIndex: number,
      lineIndices: number[],
    ) =>
      ipcRenderer.invoke(IPC.GIT_DISCARD_LINES, {
        filePath,
        hunkIndex,
        lineIndices,
      }),
    getWorktrees: () => ipcRenderer.invoke(IPC.GIT_WORKTREE_LIST),
    addWorktree: (opts: { path: string; base: string; newBranch?: string }) =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_ADD, opts),
    removeWorktree: (opts: { path: string; force?: boolean }) =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_REMOVE, opts),
    lockWorktree: (opts: { path: string; reason?: string }) =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_LOCK, opts),
    unlockWorktree: (worktreePath: string) =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_UNLOCK, worktreePath),
    getWorktreeDirtyStatus: (paths: string[]) =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_DIRTY_STATUS, paths),
    pruneWorktrees: () => ipcRenderer.invoke(IPC.GIT_WORKTREE_PRUNE),
    resetToCommit: (hash: string, mode: 'soft' | 'mixed' | 'hard') =>
      ipcRenderer.invoke(IPC.GIT_RESET, { hash, mode }),
    revertCommit: (hash: string) => ipcRenderer.invoke(IPC.GIT_REVERT, hash),
    cherryPick: (hash: string) => ipcRenderer.invoke(IPC.GIT_CHERRY_PICK, hash),
    getOperationInProgress: () =>
      ipcRenderer.invoke(IPC.GIT_GET_OPERATION_IN_PROGRESS),
    resolveConflict: (filePath: string, strategy: 'mine' | 'theirs') =>
      ipcRenderer.invoke(IPC.GIT_RESOLVE_CONFLICT, { filePath, strategy }),
    markResolved: (filePath: string) =>
      ipcRenderer.invoke(IPC.GIT_MARK_RESOLVED, filePath),
    markUnresolved: (filePath: string) =>
      ipcRenderer.invoke(IPC.GIT_MARK_UNRESOLVED, filePath),
    abortOperation: () => ipcRenderer.invoke(IPC.GIT_ABORT_OPERATION),
    continueOperation: () => ipcRenderer.invoke(IPC.GIT_CONTINUE_OPERATION),
    getRebasePlan: (baseHash: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_REBASE_PLAN, baseHash),
    runInteractiveRebase: (plan: import('../shared/rebase-types').RebasePlan) =>
      ipcRenderer.invoke(IPC.GIT_RUN_INTERACTIVE_REBASE, plan),
    getFileHistory: (
      path: string,
      opts?: { followRenames?: boolean; ref?: string },
    ) =>
      ipcRenderer.invoke(IPC.GIT_GET_FILE_HISTORY, {
        path,
        followRenames: opts?.followRenames ?? false,
        ref: opts?.ref,
      }),
    getBlame: (path: string, ref?: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_BLAME, { path, ref }),
    getFileAtCommit: (path: string, ref: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_FILE_AT_COMMIT, { path, ref }),
    archiveCommit: (hash: string, defaultName: string) =>
      ipcRenderer.invoke(IPC.GIT_ARCHIVE, { hash, defaultName }),
    createPatchFromCommit: (hash: string, defaultName: string) =>
      ipcRenderer.invoke(IPC.GIT_CREATE_PATCH_FROM_COMMIT, {
        hash,
        defaultName,
      }),
    pushRevision: (
      remote: string,
      hash: string,
      branch: string,
      force?: boolean,
    ) =>
      ipcRenderer.invoke(IPC.GIT_PUSH_REVISION, {
        remote,
        hash,
        branch,
        force,
      }),
  },
  repo: {
    getCurrentPath: () => ipcRenderer.invoke(IPC.REPO_GET_CURRENT),
    onRepoChanged: (callback: (path: string) => void) => {
      ipcRenderer.on(IPC.REPO_CHANGED, (_event, path: string) =>
        callback(path),
      );
    },
    loadList: () => ipcRenderer.invoke(IPC.REPO_LOAD_LIST),
    open: (path: string) => ipcRenderer.invoke(IPC.REPO_OPEN, path),
    openEphemeral: (path: string) =>
      ipcRenderer.invoke(IPC.REPO_OPEN_EPHEMERAL, path),
    removeFromList: (path: string) =>
      ipcRenderer.invoke(IPC.REPO_REMOVE_FROM_LIST, path),
    addExisting: (path: string) =>
      ipcRenderer.invoke(IPC.REPO_ADD_EXISTING, path),
    clone: (url: string, destPath: string) =>
      ipcRenderer.invoke(IPC.REPO_CLONE, { url, destPath }),
    initLocal: (destPath: string) =>
      ipcRenderer.invoke(IPC.REPO_INIT_LOCAL, destPath),
    scan: (rootPath: string) => ipcRenderer.invoke(IPC.REPO_SCAN, rootPath),
    setFavourite: (path: string, value: boolean) =>
      ipcRenderer.invoke(IPC.REPO_SET_FAVOURITE, { path, value }),
    pickDirectory: (opts?: { title?: string; defaultPath?: string }) =>
      ipcRenderer.invoke(IPC.DIALOG_PICK_DIRECTORY, opts),
    showBrowser: () => ipcRenderer.invoke(IPC.WINDOW_SHOW_BROWSER),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    update: (patch: DeepPartial<RepoSettings>) =>
      ipcRenderer.invoke(IPC.SETTINGS_UPDATE, patch),
  },
  appSettings: {
    get: () => ipcRenderer.invoke(IPC.APP_SETTINGS_GET),
    update: (patch: DeepPartial<AppSettings>) =>
      ipcRenderer.invoke(IPC.APP_SETTINGS_UPDATE, patch),
    showWindow: () => ipcRenderer.invoke(IPC.WINDOW_SHOW_SETTINGS),
    onChanged: (cb: (settings: AppSettings) => void) => {
      const listener = (_: unknown, settings: AppSettings) => cb(settings);
      ipcRenderer.on(IPC.APP_SETTINGS_CHANGED, listener);
      return () => ipcRenderer.off(IPC.APP_SETTINGS_CHANGED, listener);
    },
  },
  theme: {
    getResolved: (): Promise<'light' | 'dark'> =>
      ipcRenderer.invoke(IPC.THEME_GET_RESOLVED),
    onResolved: (cb: (theme: 'light' | 'dark') => void) => {
      const listener = (_: unknown, theme: 'light' | 'dark') => cb(theme);
      ipcRenderer.on(IPC.THEME_RESOLVED, listener);
      return () => ipcRenderer.off(IPC.THEME_RESOLVED, listener);
    },
  },
  ai: {
    getHardwareInfo: () => ipcRenderer.invoke(IPC.AI_GET_HARDWARE_INFO),
    listModels: () => ipcRenderer.invoke(IPC.AI_LIST_MODELS),
    downloadModel: (opts: AIDownloadOpts) =>
      ipcRenderer.invoke(IPC.AI_DOWNLOAD_MODEL, opts),
    cancelDownload: (id: string) =>
      ipcRenderer.invoke(IPC.AI_CANCEL_DOWNLOAD, id),
    removeModel: (id: string) => ipcRenderer.invoke(IPC.AI_REMOVE_MODEL, id),
    inferStream: (req: AIInferRequest) =>
      ipcRenderer.invoke(IPC.AI_INFER_STREAM, req),
    cancelInfer: (requestId: string) =>
      ipcRenderer.invoke(IPC.AI_CANCEL_INFER, requestId),
    holdModel: () => ipcRenderer.invoke(IPC.AI_HOLD_MODEL),
    releaseModel: (holderId: string) =>
      ipcRenderer.invoke(IPC.AI_RELEASE_MODEL, holderId),
    getSourceReady: () => ipcRenderer.invoke(IPC.AI_GET_SOURCE_READY),
    onToken: (cb: (event: AITokenEvent) => void) => {
      const listener = (_: unknown, event: AITokenEvent) => cb(event);
      ipcRenderer.on(IPC.AI_INFER_TOKEN, listener);
      return () => ipcRenderer.off(IPC.AI_INFER_TOKEN, listener);
    },
    onState: (cb: (event: AIStateEvent) => void) => {
      const listener = (_: unknown, event: AIStateEvent) => cb(event);
      ipcRenderer.on(IPC.AI_STATE_CHANGED, listener);
      return () => ipcRenderer.off(IPC.AI_STATE_CHANGED, listener);
    },
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', api);
