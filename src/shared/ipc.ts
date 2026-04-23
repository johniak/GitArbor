import type {
  Branch,
  Remote,
  Tag,
  Stash,
  Commit,
  ChangedFile,
  FileDiff,
  WorkingStatus,
} from '../renderer/types';
import type { DeepPartial, RepoSettings } from './repo-settings-types';

export type { DeepPartial, RepoSettings } from './repo-settings-types';
export { DEFAULT_REPO_SETTINGS } from './repo-settings-types';

export interface GetCommitsRequest {
  maxCount?: number;
  skip?: number;
  all?: boolean;
  logOrder?: 'date' | 'topo';
}

/** IPC channel names — single source of truth for main + renderer */
export const IPC = {
  GIT_GET_BRANCHES: 'git:get-branches',
  GIT_GET_REMOTES: 'git:get-remotes',
  GIT_GET_TAGS: 'git:get-tags',
  GIT_GET_STASHES: 'git:get-stashes',
  GIT_GET_COMMITS: 'git:get-commits',
  GIT_GET_COMMIT_BODY: 'git:get-commit-body',
  GIT_GET_COMMIT_FILES: 'git:get-commit-files',
  GIT_GET_FILE_DIFF: 'git:get-file-diff',
  GIT_GET_WORKING_STATUS: 'git:get-working-status',
  GIT_GET_WORKING_DIFF: 'git:get-working-diff',
  GIT_STAGE_FILE: 'git:stage-file',
  GIT_UNSTAGE_FILE: 'git:unstage-file',
  GIT_STAGE_ALL: 'git:stage-all',
  GIT_UNSTAGE_ALL: 'git:unstage-all',
  GIT_COMMIT: 'git:commit',
  GIT_PULL: 'git:pull',
  GIT_PUSH: 'git:push',
  GIT_PUSH_BRANCHES: 'git:push-branches',
  GIT_FETCH: 'git:fetch',
  GIT_STASH: 'git:stash',
  GIT_APPLY_STASH: 'git:apply-stash',
  GIT_MERGE: 'git:merge',
  GIT_REBASE: 'git:rebase',
  GIT_GET_CONFIG: 'git:get-config',
  GIT_CHECKOUT: 'git:checkout',
  GIT_CREATE_BRANCH: 'git:create-branch',
  GIT_CREATE_TAG: 'git:create-tag',
  GIT_DELETE_TAG: 'git:delete-tag',
  GIT_PUSH_TAG: 'git:push-tag',
  GIT_DELETE_REMOTE_TAG: 'git:delete-remote-tag',
  GIT_DISCARD_FILE: 'git:discard-file',
  GIT_IGNORE_FILE: 'git:ignore-file',
  GIT_CREATE_PATCH: 'git:create-patch',
  GIT_RESET: 'git:reset',
  GIT_REVERT: 'git:revert',
  GIT_CHERRY_PICK: 'git:cherry-pick',
  GIT_ARCHIVE: 'git:archive',
  GIT_CREATE_PATCH_FROM_COMMIT: 'git:create-patch-from-commit',
  GIT_PUSH_REVISION: 'git:push-revision',
  GIT_STAGE_HUNK: 'git:stage-hunk',
  GIT_UNSTAGE_HUNK: 'git:unstage-hunk',
  GIT_STAGE_LINES: 'git:stage-lines',
  GIT_UNSTAGE_LINES: 'git:unstage-lines',
  GIT_DISCARD_LINES: 'git:discard-lines',
  SHELL_OPEN_FILE: 'shell:open-file',
  REPO_GET_CURRENT: 'repo:get-current',
  REPO_CHANGED: 'repo:changed',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
} as const;

/** Request/response types per IPC channel */
export interface IpcChannelMap {
  [IPC.GIT_GET_BRANCHES]: { request: void; response: Branch[] };
  [IPC.GIT_GET_REMOTES]: { request: void; response: Remote[] };
  [IPC.GIT_GET_TAGS]: { request: void; response: Tag[] };
  [IPC.GIT_GET_STASHES]: { request: void; response: Stash[] };
  [IPC.GIT_GET_COMMITS]: { request: GetCommitsRequest; response: Commit[] };
}

/** Type-safe API exposed to renderer via contextBridge */
export interface GitAPI {
  getBranches(): Promise<Branch[]>;
  getRemotes(): Promise<Remote[]>;
  getTags(): Promise<Tag[]>;
  getStashes(): Promise<Stash[]>;
  getCommits(opts?: GetCommitsRequest): Promise<Commit[]>;
  getCommitBody(hash: string): Promise<string>;
  getCommitFiles(hash: string): Promise<ChangedFile[]>;
  getFileDiff(hash: string, filePath: string): Promise<FileDiff>;
  getWorkingStatus(): Promise<WorkingStatus>;
  getWorkingDiff(filePath: string, staged: boolean): Promise<FileDiff>;
  stageFile(path: string): Promise<void>;
  unstageFile(path: string): Promise<void>;
  stageAll(): Promise<void>;
  unstageAll(): Promise<void>;
  commit(message: string, amend?: boolean, noVerify?: boolean): Promise<void>;
  pull(): Promise<void>;
  push(): Promise<void>;
  pushBranches(
    remote: string,
    branches: Array<{ local: string; remote?: string; setUpstream?: boolean }>,
    includeTags?: boolean,
  ): Promise<void>;
  fetch(): Promise<void>;
  stash(message?: string, keepIndex?: boolean): Promise<void>;
  applyStash(index: number, drop: boolean): Promise<{ conflicts: string[] }>;
  merge(
    branch: string,
  ): Promise<{ conflicts: string[]; summary: string; error?: string }>;
  rebase(
    branch: string,
  ): Promise<{ conflicts: string[]; summary: string; error?: string }>;
  getConfig(key: string): Promise<string>;
  checkout(target: string): Promise<void>;
  createBranch(name: string, startPoint?: string): Promise<void>;
  createTag(
    name: string,
    commit: string,
    opts?: { message?: string; force?: boolean },
  ): Promise<void>;
  deleteTag(name: string): Promise<void>;
  pushTag(name: string, remote: string): Promise<void>;
  deleteRemoteTag(name: string, remote: string): Promise<void>;
  discardFile(path: string, isUntracked: boolean): Promise<void>;
  ignoreFile(path: string): Promise<void>;
  openFile(path: string): Promise<void>;
  createPatch(filePath: string, staged: boolean): Promise<void>;
  resetToCommit(hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void>;
  revertCommit(
    hash: string,
  ): Promise<{ conflicts: string[]; summary: string; error?: string }>;
  cherryPick(
    hash: string,
  ): Promise<{ conflicts: string[]; summary: string; error?: string }>;
  archiveCommit(
    hash: string,
    defaultName: string,
  ): Promise<{ canceled?: boolean }>;
  createPatchFromCommit(
    hash: string,
    defaultName: string,
  ): Promise<{ canceled?: boolean }>;
  pushRevision(
    remote: string,
    hash: string,
    branch: string,
    force?: boolean,
  ): Promise<void>;
  stageHunk(filePath: string, hunkIndex: number): Promise<void>;
  unstageHunk(filePath: string, hunkIndex: number): Promise<void>;
  stageLines(
    filePath: string,
    hunkIndex: number,
    lineIndices: number[],
  ): Promise<void>;
  unstageLines(
    filePath: string,
    hunkIndex: number,
    lineIndices: number[],
  ): Promise<void>;
  discardLines(
    filePath: string,
    hunkIndex: number,
    lineIndices: number[],
  ): Promise<void>;
}

export interface RepoAPI {
  getCurrentPath(): Promise<string | null>;
  onRepoChanged(callback: (path: string) => void): void;
}

export interface SettingsAPI {
  get(): Promise<RepoSettings>;
  update(patch: DeepPartial<RepoSettings>): Promise<RepoSettings>;
}

export interface ElectronAPI {
  git: GitAPI;
  repo: RepoAPI;
  settings: SettingsAPI;
  platform: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
