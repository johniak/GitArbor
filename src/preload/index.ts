import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type {
  DeepPartial,
  ElectronAPI,
  GetCommitsRequest,
  RepoSettings,
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
    commit: (message: string, amend?: boolean, noVerify?: boolean) =>
      ipcRenderer.invoke(IPC.GIT_COMMIT, { message, amend, noVerify }),
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
    resetToCommit: (hash: string, mode: 'soft' | 'mixed' | 'hard') =>
      ipcRenderer.invoke(IPC.GIT_RESET, { hash, mode }),
    revertCommit: (hash: string) => ipcRenderer.invoke(IPC.GIT_REVERT, hash),
    cherryPick: (hash: string) => ipcRenderer.invoke(IPC.GIT_CHERRY_PICK, hash),
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
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    update: (patch: DeepPartial<RepoSettings>) =>
      ipcRenderer.invoke(IPC.SETTINGS_UPDATE, patch),
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', api);
