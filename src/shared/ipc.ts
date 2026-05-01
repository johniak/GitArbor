import type {
  Branch,
  Remote,
  Tag,
  Stash,
  Commit,
  ChangedFile,
  FileDiff,
  WorkingStatus,
  Worktree,
} from '../renderer/types';
import type { DeepPartial } from './deep-merge';
import type { RepoSettings } from './repo-settings-types';
import type { AppSettings } from './app-settings-types';
import type {
  RebasePlan,
  RebaseStep,
  RunInteractiveRebaseResult,
} from './rebase-types';

export type {
  RebaseAction,
  RebasePlan,
  RebaseStep,
  RunInteractiveRebaseResult,
} from './rebase-types';
export type { BlameLine } from './blame-parser';
export type { Worktree } from '../renderer/types';

export type { DeepPartial } from './deep-merge';
export type { RepoSettings } from './repo-settings-types';
export { DEFAULT_REPO_SETTINGS } from './repo-settings-types';
export type {
  AppSettings,
  DiffSettings,
  DiffViewMode,
} from './app-settings-types';
export { DEFAULT_APP_SETTINGS } from './app-settings-types';
export type {
  AIAPI,
  AISettings,
  AISource,
  CodingAgentTool,
  SourceReadyInfo,
  AIInferRequest,
  AIInferKind,
  AITokenEvent,
  AIStateEvent,
  AIDownloadOpts,
  CuratedModel,
  AIModelFamily,
  DownloadedModelMeta,
  HardwareInfo,
  GpuKind,
  ModelEntry,
  ModelStatus,
  DownloadProgress,
} from './ai-types';
export {
  CURATED_MODELS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_MODEL_ID,
} from './ai-types';

export interface GetCommitsRequest {
  maxCount?: number;
  skip?: number;
  all?: boolean;
  logOrder?: 'date' | 'topo';
}

export type OperationKind = 'merge' | 'rebase' | 'cherry-pick' | 'revert';

export interface OperationInProgress {
  kind: OperationKind;
}

export type ConflictStrategy = 'mine' | 'theirs';

export type SearchMode = 'message' | 'author' | 'sha' | 'file-content';

export interface SearchCommitsRequest {
  query: string;
  mode: SearchMode;
  since?: string;
  until?: string;
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
  GIT_GET_OPERATION_IN_PROGRESS: 'git:get-operation-in-progress',
  GIT_RESOLVE_CONFLICT: 'git:resolve-conflict',
  GIT_MARK_RESOLVED: 'git:mark-resolved',
  GIT_MARK_UNRESOLVED: 'git:mark-unresolved',
  GIT_ABORT_OPERATION: 'git:abort-operation',
  GIT_CONTINUE_OPERATION: 'git:continue-operation',
  GIT_GET_REBASE_PLAN: 'git:get-rebase-plan',
  GIT_RUN_INTERACTIVE_REBASE: 'git:run-interactive-rebase',
  GIT_GET_FILE_HISTORY: 'git:get-file-history',
  GIT_GET_BLAME: 'git:get-blame',
  GIT_GET_FILE_AT_COMMIT: 'git:get-file-at-commit',
  GIT_DELETE_BRANCH: 'git:delete-branch',
  GIT_SEARCH_COMMITS: 'git:search-commits',
  GIT_ARCHIVE: 'git:archive',
  GIT_CREATE_PATCH_FROM_COMMIT: 'git:create-patch-from-commit',
  GIT_PUSH_REVISION: 'git:push-revision',
  GIT_STAGE_HUNK: 'git:stage-hunk',
  GIT_UNSTAGE_HUNK: 'git:unstage-hunk',
  GIT_STAGE_LINES: 'git:stage-lines',
  GIT_UNSTAGE_LINES: 'git:unstage-lines',
  GIT_DISCARD_LINES: 'git:discard-lines',
  GIT_WORKTREE_LIST: 'git:worktree-list',
  GIT_WORKTREE_ADD: 'git:worktree-add',
  GIT_WORKTREE_REMOVE: 'git:worktree-remove',
  GIT_WORKTREE_LOCK: 'git:worktree-lock',
  GIT_WORKTREE_UNLOCK: 'git:worktree-unlock',
  GIT_WORKTREE_DIRTY_STATUS: 'git:worktree-dirty-status',
  GIT_WORKTREE_PRUNE: 'git:worktree-prune',
  SHELL_OPEN_FILE: 'shell:open-file',
  SHELL_OPEN_REPO_FOLDER: 'shell:open-repo-folder',
  SHELL_OPEN_TERMINAL: 'shell:open-terminal',
  REPO_GET_CURRENT: 'repo:get-current',
  REPO_CHANGED: 'repo:changed',
  REPO_LOAD_LIST: 'repo:load-list',
  REPO_OPEN: 'repo:open',
  REPO_OPEN_EPHEMERAL: 'repo:open-ephemeral',
  REPO_REMOVE_FROM_LIST: 'repo:remove-from-list',
  REPO_ADD_EXISTING: 'repo:add-existing',
  REPO_CLONE: 'repo:clone',
  REPO_INIT_LOCAL: 'repo:init-local',
  REPO_SCAN: 'repo:scan',
  REPO_SET_FAVOURITE: 'repo:set-favourite',
  DIALOG_PICK_DIRECTORY: 'dialog:pick-directory',
  WINDOW_SHOW_BROWSER: 'window:show-browser',
  WINDOW_SHOW_SETTINGS: 'window:show-settings',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  APP_SETTINGS_GET: 'app-settings:get',
  APP_SETTINGS_UPDATE: 'app-settings:update',
  APP_SETTINGS_CHANGED: 'app-settings:changed',
  THEME_GET_RESOLVED: 'theme:get-resolved',
  THEME_RESOLVED: 'theme:resolved',
  AI_GET_HARDWARE_INFO: 'ai:get-hardware-info',
  AI_LIST_MODELS: 'ai:list-models',
  AI_DOWNLOAD_MODEL: 'ai:download-model',
  AI_CANCEL_DOWNLOAD: 'ai:cancel-download',
  AI_REMOVE_MODEL: 'ai:remove-model',
  AI_INFER_STREAM: 'ai:infer-stream',
  AI_CANCEL_INFER: 'ai:cancel-infer',
  AI_HOLD_MODEL: 'ai:hold-model',
  AI_RELEASE_MODEL: 'ai:release-model',
  AI_GET_SOURCE_READY: 'ai:get-source-ready',
  AI_INFER_TOKEN: 'ai:infer-token',
  AI_STATE_CHANGED: 'ai:state-changed',
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
  commit(
    message: string,
    opts?: {
      amend?: boolean;
      noVerify?: boolean;
      stageAll?: boolean;
      exclude?: string[];
    },
  ): Promise<void>;
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
  deleteBranch(name: string, force: boolean): Promise<{ error?: string }>;
  searchCommits(request: SearchCommitsRequest): Promise<Commit[]>;
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
  openRepoFolder(): Promise<void>;
  openTerminal(): Promise<{ error?: string }>;
  createPatch(filePath: string, staged: boolean): Promise<void>;
  resetToCommit(hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void>;
  revertCommit(
    hash: string,
  ): Promise<{ conflicts: string[]; summary: string; error?: string }>;
  cherryPick(
    hash: string,
  ): Promise<{ conflicts: string[]; summary: string; error?: string }>;
  getOperationInProgress(): Promise<OperationInProgress | null>;
  resolveConflict(
    filePath: string,
    strategy: ConflictStrategy,
  ): Promise<{ error?: string }>;
  markResolved(filePath: string): Promise<{ error?: string }>;
  markUnresolved(filePath: string): Promise<{ error?: string }>;
  abortOperation(): Promise<{ error?: string }>;
  continueOperation(): Promise<{ error?: string }>;
  getRebasePlan(baseHash: string): Promise<RebaseStep[]>;
  runInteractiveRebase(plan: RebasePlan): Promise<RunInteractiveRebaseResult>;
  getFileHistory(
    path: string,
    opts?: { followRenames?: boolean; ref?: string },
  ): Promise<Commit[]>;
  getBlame(
    path: string,
    ref?: string,
  ): Promise<import('./blame-parser').BlameLine[]>;
  getFileAtCommit(path: string, ref: string): Promise<string>;
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
  // ── Worktrees ──────────────────────────────────────────────
  getWorktrees(): Promise<Worktree[]>;
  addWorktree(opts: {
    path: string;
    base: string;
    newBranch?: string;
  }): Promise<{ error?: string }>;
  removeWorktree(opts: {
    path: string;
    force?: boolean;
  }): Promise<{ error?: string }>;
  lockWorktree(opts: {
    path: string;
    reason?: string;
  }): Promise<{ error?: string }>;
  unlockWorktree(worktreePath: string): Promise<{ error?: string }>;
  getWorktreeDirtyStatus(paths: string[]): Promise<Record<string, boolean>>;
  pruneWorktrees(): Promise<{ error?: string }>;
}

export interface RepoListEntry {
  path: string;
  name: string;
  isFavourite: boolean;
  lastOpenedAt: number;
}

export interface RepoAPI {
  getCurrentPath(): Promise<string | null>;
  onRepoChanged(callback: (path: string) => void): void;
  loadList(): Promise<RepoListEntry[]>;
  open(path: string): Promise<{ success: boolean; error?: string }>;
  /** Switch the active repo without touching Recent Repositories or
   *  rebuilding the application menu. Used for worktree tab switching. */
  openEphemeral(path: string): Promise<{ success: boolean; error?: string }>;
  removeFromList(path: string): Promise<void>;
  addExisting(path: string): Promise<RepoListEntry | null>;
  clone(
    url: string,
    destPath: string,
  ): Promise<{ entry?: RepoListEntry; error?: string }>;
  initLocal(
    destPath: string,
  ): Promise<{ entry?: RepoListEntry; error?: string }>;
  scan(rootPath: string): Promise<RepoListEntry[]>;
  setFavourite(path: string, value: boolean): Promise<void>;
  pickDirectory(options?: {
    title?: string;
    defaultPath?: string;
  }): Promise<string | null>;
  showBrowser(): Promise<void>;
}

export interface SettingsAPI {
  get(): Promise<RepoSettings>;
  update(patch: DeepPartial<RepoSettings>): Promise<RepoSettings>;
}

export interface AppSettingsAPI {
  get(): Promise<AppSettings>;
  update(patch: DeepPartial<AppSettings>): Promise<AppSettings>;
  showWindow(): Promise<void>;
  onChanged(cb: (settings: AppSettings) => void): () => void;
}

export interface ThemeAPI {
  getResolved(): Promise<'light' | 'dark'>;
  onResolved(cb: (theme: 'light' | 'dark') => void): () => void;
}

export interface ElectronAPI {
  git: GitAPI;
  repo: RepoAPI;
  settings: SettingsAPI;
  appSettings: AppSettingsAPI;
  theme: ThemeAPI;
  ai: import('./ai-types').AIAPI;
  platform: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
