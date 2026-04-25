import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import simpleGit from 'simple-git';
import { GitService, cloneRepository, initRepository } from './git-service';
import { openTerminal } from './open-terminal';
import { createDatabase } from './db';
import { RepoManager } from './repo-manager';
import {
  configureRepoSettings,
  flushRepoSettings,
  loadRepoSettings,
  updateRepoSettings,
} from './repo-settings';
import {
  configureAppSettings,
  flushAppSettings,
  loadAppSettings,
  updateAppSettings,
} from './app-settings';
import { IPC } from '../shared/ipc';
import type { DeepPartial, RepoSettings, AppSettings } from '../shared/ipc';
import { DEFAULT_REPO_SETTINGS } from '../shared/ipc';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const repoPath = process.env.REPO_PATH || process.cwd();

const defaultGit = new GitService(simpleGit(repoPath));
let repoManager: RepoManager | null = null;
let mainWindow: BrowserWindow | null = null;
let repoBrowserWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

function getIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon_256.png')
    : path.join(process.cwd(), 'build', 'icons', 'icon_256.png');
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // The renderer's <title> would otherwise win (Electron auto-syncs
  // document.title). When a repo is open, keep the window title pinned
  // to its basename instead.
  win.on('page-title-updated', (e) => {
    const current = repoManager?.getCurrentPath();
    if (current) {
      e.preventDefault();
      win.setTitle(path.basename(current));
    }
  });

  if (process.env.NODE_ENV !== 'test') {
    win.on('focus', () => {
      win.webContents.send(IPC.REPO_CHANGED, repoManager?.getCurrentPath());
    });
  }

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
    repoManager?.buildMenu();
  });

  return win;
}

function createRepoBrowserWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 760,
    height: 900,
    icon: getIconPath(),
    title: 'Repository Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const base = MAIN_WINDOW_VITE_DEV_SERVER_URL.endsWith('/')
      ? MAIN_WINDOW_VITE_DEV_SERVER_URL
      : `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/`;
    win.loadURL(`${base}repo-browser.html`);
  } else {
    win.loadFile(
      path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/repo-browser.html`,
      ),
    );
  }

  win.on('closed', () => {
    if (repoBrowserWindow === win) repoBrowserWindow = null;
  });

  return win;
}

function showRepoBrowser(): BrowserWindow {
  if (repoBrowserWindow && !repoBrowserWindow.isDestroyed()) {
    if (repoBrowserWindow.isMinimized()) repoBrowserWindow.restore();
    repoBrowserWindow.show();
    repoBrowserWindow.focus();
    return repoBrowserWindow;
  }
  repoBrowserWindow = createRepoBrowserWindow();
  return repoBrowserWindow;
}

function ensureMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }
  mainWindow = createMainWindow();
  return mainWindow;
}

function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 760,
    height: 560,
    icon: getIconPath(),
    title: 'Settings',
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const base = MAIN_WINDOW_VITE_DEV_SERVER_URL.endsWith('/')
      ? MAIN_WINDOW_VITE_DEV_SERVER_URL
      : `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/`;
    win.loadURL(`${base}settings.html`);
  } else {
    win.loadFile(
      path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/settings.html`,
      ),
    );
  }

  win.on('page-title-updated', (e) => {
    e.preventDefault();
    win.setTitle('Settings');
  });

  win.on('closed', () => {
    if (settingsWindow === win) settingsWindow = null;
  });

  return win;
}

function showSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }
  settingsWindow = createSettingsWindow();
  return settingsWindow;
}

// Git IPC handlers — delegate to repo manager's git service or default
function getGitService(): GitService {
  return repoManager?.getGitService() ?? defaultGit;
}

ipcMain.handle(IPC.GIT_GET_BRANCHES, () => getGitService().getBranches());
ipcMain.handle(IPC.GIT_GET_REMOTES, () => getGitService().getRemotes());
ipcMain.handle(IPC.GIT_GET_TAGS, () => getGitService().getTags());
ipcMain.handle(IPC.GIT_GET_STASHES, () => getGitService().getStashes());
ipcMain.handle(IPC.GIT_GET_COMMITS, (_event, opts) =>
  getGitService().getCommits(opts),
);
ipcMain.handle(IPC.GIT_GET_COMMIT_BODY, (_event, hash: string) =>
  getGitService().getCommitBody(hash),
);
ipcMain.handle(IPC.GIT_GET_COMMIT_FILES, (_event, hash: string) =>
  getGitService().getCommitFiles(hash),
);
ipcMain.handle(
  IPC.GIT_GET_FILE_DIFF,
  (_event, { hash, filePath }: { hash: string; filePath: string }) =>
    getGitService().getFileDiff(hash, filePath),
);
ipcMain.handle(IPC.GIT_GET_WORKING_STATUS, () =>
  getGitService().getWorkingStatus(),
);
ipcMain.handle(
  IPC.GIT_GET_WORKING_DIFF,
  (_event, { filePath, staged }: { filePath: string; staged: boolean }) =>
    getGitService().getWorkingDiff(filePath, staged),
);
ipcMain.handle(IPC.GIT_STAGE_FILE, (_event, path: string) =>
  getGitService().stageFile(path),
);
ipcMain.handle(IPC.GIT_UNSTAGE_FILE, (_event, path: string) =>
  getGitService().unstageFile(path),
);
ipcMain.handle(IPC.GIT_STAGE_ALL, () => getGitService().stageAll());
ipcMain.handle(IPC.GIT_UNSTAGE_ALL, () => getGitService().unstageAll());
ipcMain.handle(
  IPC.GIT_COMMIT,
  (
    _event,
    {
      message,
      amend,
      noVerify,
    }: { message: string; amend?: boolean; noVerify?: boolean },
  ) => {
    const s = loadAppSettings();
    const author =
      s.general.overrideAuthorOnCommit &&
      s.general.authorName &&
      s.general.authorEmail
        ? { name: s.general.authorName, email: s.general.authorEmail }
        : undefined;
    return getGitService().commit(message, amend, noVerify, author);
  },
);
ipcMain.handle(IPC.GIT_PULL, () => getGitService().pull());
ipcMain.handle(IPC.GIT_PUSH, () => getGitService().push());
ipcMain.handle(
  IPC.GIT_PUSH_BRANCHES,
  (
    _event,
    {
      remote,
      branches,
      includeTags,
    }: {
      remote: string;
      branches: Array<{
        local: string;
        remote?: string;
        setUpstream?: boolean;
      }>;
      includeTags?: boolean;
    },
  ) => getGitService().pushBranches(remote, branches, includeTags),
);
ipcMain.handle(IPC.GIT_FETCH, () => getGitService().fetch());
ipcMain.handle(
  IPC.GIT_APPLY_STASH,
  (_event, { index, drop }: { index: number; drop: boolean }) =>
    getGitService().applyStash(index, drop),
);
ipcMain.handle(
  IPC.GIT_STASH,
  (_event, opts?: { message?: string; keepIndex?: boolean }) =>
    getGitService().stash(opts?.message, opts?.keepIndex),
);
ipcMain.handle(IPC.GIT_MERGE, (_event, branch: string) =>
  getGitService().merge(branch),
);
ipcMain.handle(IPC.GIT_REBASE, (_event, branch: string) =>
  getGitService().rebase(branch),
);
ipcMain.handle(IPC.GIT_GET_CONFIG, (_event, key: string) =>
  getGitService().getConfig(key),
);
ipcMain.handle(
  IPC.GIT_CREATE_BRANCH,
  (_event, { name, startPoint }: { name: string; startPoint?: string }) =>
    getGitService().createBranch(name, startPoint),
);

ipcMain.handle(
  IPC.GIT_CREATE_TAG,
  (
    _event,
    {
      name,
      commit,
      opts,
    }: {
      name: string;
      commit: string;
      opts?: { message?: string; force?: boolean };
    },
  ) => getGitService().createTag(name, commit, opts),
);

ipcMain.handle(IPC.GIT_DELETE_TAG, (_event, name: string) =>
  getGitService().deleteTag(name),
);

ipcMain.handle(
  IPC.GIT_PUSH_TAG,
  (_event, { name, remote }: { name: string; remote: string }) =>
    getGitService().pushTag(name, remote),
);

ipcMain.handle(
  IPC.GIT_DELETE_REMOTE_TAG,
  (_event, { name, remote }: { name: string; remote: string }) =>
    getGitService().deleteRemoteTag(name, remote),
);

ipcMain.handle(IPC.GIT_CHECKOUT, async (_event, target: string) => {
  await getGitService().checkout(target);
  // Notify renderer to reload
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(IPC.REPO_CHANGED, repoManager?.getCurrentPath());
  });
});

ipcMain.handle(
  IPC.GIT_DISCARD_FILE,
  async (
    _event,
    { path: filePath, isUntracked }: { path: string; isUntracked: boolean },
  ) => {
    const git = getGitService();
    // If file is staged, unstage first
    try {
      await git.unstageFile(filePath);
    } catch {
      // Not staged — fine
    }
    await git.discardFile(filePath, isUntracked);
  },
);

ipcMain.handle(IPC.GIT_IGNORE_FILE, (_event, filePath: string) =>
  getGitService().ignoreFile(filePath),
);

ipcMain.handle(IPC.SHELL_OPEN_FILE, async (_event, filePath: string) => {
  const root = await getGitService().getRepoRoot();
  await shell.openPath(path.join(root, filePath));
});

ipcMain.handle(IPC.SHELL_OPEN_REPO_FOLDER, async () => {
  const root = await getGitService().getRepoRoot();
  await shell.openPath(root);
});

ipcMain.handle(
  IPC.SHELL_OPEN_TERMINAL,
  async (): Promise<{ error?: string }> => {
    const root = await getGitService().getRepoRoot();
    return openTerminal(root);
  },
);

/**
 * Wrap dialog.showSaveDialog so e2e tests can bypass the native picker by
 * setting E2E_SAVE_PATH to a fixed file path. In production the real Electron
 * dialog is shown.
 */
async function showSaveDialog(
  win: BrowserWindow | null,
  opts: Electron.SaveDialogOptions,
): Promise<{ canceled: boolean; filePath?: string }> {
  if (process.env.E2E_SAVE_PATH) {
    return { canceled: false, filePath: process.env.E2E_SAVE_PATH };
  }
  return await dialog.showSaveDialog(win!, opts);
}

ipcMain.handle(
  IPC.GIT_CREATE_PATCH,
  async (
    _event,
    { filePath, staged }: { filePath: string; staged: boolean },
  ) => {
    const raw = await getGitService().createPatch(filePath, staged);
    if (!raw.trim()) return;

    const win = BrowserWindow.getFocusedWindow();
    const defaultName = filePath.replace(/\//g, '_') + '.patch';
    const result = await showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [{ name: 'Patch files', extensions: ['patch', 'diff'] }],
    });
    if (result.canceled || !result.filePath) return;
    fs.writeFileSync(result.filePath, raw, 'utf-8');
  },
);

function notifyRepoChanged() {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(IPC.REPO_CHANGED, repoManager?.getCurrentPath());
  });
}

ipcMain.handle(
  IPC.GIT_RESET,
  async (
    _event,
    { hash, mode }: { hash: string; mode: 'soft' | 'mixed' | 'hard' },
  ) => {
    await getGitService().resetToCommit(hash, mode);
    notifyRepoChanged();
  },
);

ipcMain.handle(IPC.GIT_REVERT, async (_event, hash: string) => {
  const res = await getGitService().revertCommit(hash);
  notifyRepoChanged();
  return res;
});

ipcMain.handle(IPC.GIT_CHERRY_PICK, async (_event, hash: string) => {
  const res = await getGitService().cherryPick(hash);
  notifyRepoChanged();
  return res;
});

ipcMain.handle(IPC.GIT_GET_OPERATION_IN_PROGRESS, () =>
  getGitService().getOperationInProgress(),
);

ipcMain.handle(
  IPC.GIT_RESOLVE_CONFLICT,
  async (
    _event,
    { filePath, strategy }: { filePath: string; strategy: 'mine' | 'theirs' },
  ) => {
    const res = await getGitService().resolveConflict(filePath, strategy);
    notifyRepoChanged();
    return res;
  },
);

ipcMain.handle(IPC.GIT_MARK_RESOLVED, async (_event, filePath: string) => {
  const res = await getGitService().markResolved(filePath);
  notifyRepoChanged();
  return res;
});

ipcMain.handle(IPC.GIT_MARK_UNRESOLVED, async (_event, filePath: string) => {
  const res = await getGitService().markUnresolved(filePath);
  notifyRepoChanged();
  return res;
});

ipcMain.handle(IPC.GIT_ABORT_OPERATION, async () => {
  const res = await getGitService().abortOperation();
  notifyRepoChanged();
  return res;
});

ipcMain.handle(
  IPC.GIT_ARCHIVE,
  async (
    _event,
    { hash, defaultName }: { hash: string; defaultName: string },
  ) => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [
        { name: 'Zip archive', extensions: ['zip'] },
        { name: 'Tar archive', extensions: ['tar'] },
      ],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const format = result.filePath.toLowerCase().endsWith('.tar')
      ? 'tar'
      : 'zip';
    await getGitService().archiveCommit(hash, result.filePath, format);
    return { canceled: false };
  },
);

ipcMain.handle(
  IPC.GIT_CREATE_PATCH_FROM_COMMIT,
  async (
    _event,
    { hash, defaultName }: { hash: string; defaultName: string },
  ) => {
    const raw = await getGitService().createPatchFromCommit(hash);
    if (!raw.trim()) return { canceled: true };

    const win = BrowserWindow.getFocusedWindow();
    const result = await showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [{ name: 'Patch files', extensions: ['patch', 'diff'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, raw, 'utf-8');
    return { canceled: false };
  },
);

ipcMain.handle(
  IPC.GIT_PUSH_REVISION,
  async (
    _event,
    {
      remote,
      hash,
      branch,
      force,
    }: { remote: string; hash: string; branch: string; force?: boolean },
  ) => {
    await getGitService().pushRevision(remote, hash, branch, force);
    notifyRepoChanged();
  },
);

ipcMain.handle(
  IPC.GIT_STAGE_HUNK,
  (_event, { filePath, hunkIndex }: { filePath: string; hunkIndex: number }) =>
    getGitService().stageHunk(filePath, hunkIndex),
);
ipcMain.handle(
  IPC.GIT_UNSTAGE_HUNK,
  (_event, { filePath, hunkIndex }: { filePath: string; hunkIndex: number }) =>
    getGitService().unstageHunk(filePath, hunkIndex),
);
ipcMain.handle(
  IPC.GIT_STAGE_LINES,
  (
    _event,
    {
      filePath,
      hunkIndex,
      lineIndices,
    }: { filePath: string; hunkIndex: number; lineIndices: number[] },
  ) => getGitService().stageLines(filePath, hunkIndex, lineIndices),
);
ipcMain.handle(
  IPC.GIT_UNSTAGE_LINES,
  (
    _event,
    {
      filePath,
      hunkIndex,
      lineIndices,
    }: { filePath: string; hunkIndex: number; lineIndices: number[] },
  ) => getGitService().unstageLines(filePath, hunkIndex, lineIndices),
);
ipcMain.handle(
  IPC.GIT_DISCARD_LINES,
  (
    _event,
    {
      filePath,
      hunkIndex,
      lineIndices,
    }: { filePath: string; hunkIndex: number; lineIndices: number[] },
  ) => getGitService().discardLines(filePath, hunkIndex, lineIndices),
);

// Repo IPC handlers
ipcMain.handle(
  IPC.REPO_GET_CURRENT,
  () => repoManager?.getCurrentPath() ?? null,
);

ipcMain.handle(IPC.REPO_LOAD_LIST, () => repoManager?.loadRepoList() ?? []);

ipcMain.handle(IPC.REPO_OPEN, async (_event, targetPath: string) => {
  if (!repoManager) return { success: false, error: 'Repo manager not ready' };
  try {
    const ok = await repoManager.openRepo(targetPath);
    if (!ok) return { success: false, error: 'Not a valid git repository' };
    ensureMainWindow();
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
});

ipcMain.handle(IPC.REPO_REMOVE_FROM_LIST, (_event, targetPath: string) => {
  repoManager?.removeFromList(targetPath);
});

ipcMain.handle(IPC.REPO_ADD_EXISTING, (_event, targetPath: string) => {
  return repoManager?.addExistingRepository(targetPath) ?? null;
});

ipcMain.handle(
  IPC.REPO_CLONE,
  async (_event, { url, destPath }: { url: string; destPath: string }) => {
    try {
      await cloneRepository(url, destPath);
      const entry = repoManager?.addExistingRepository(destPath) ?? null;
      return { entry };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
);

ipcMain.handle(IPC.REPO_INIT_LOCAL, async (_event, destPath: string) => {
  try {
    await initRepository(destPath);
    const entry = repoManager?.addExistingRepository(destPath) ?? null;
    return { entry };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle(IPC.REPO_SCAN, (_event, rootPath: string) => {
  return repoManager?.scanForRepositories(rootPath) ?? [];
});

ipcMain.handle(
  IPC.REPO_SET_FAVOURITE,
  (_event, { path: targetPath, value }: { path: string; value: boolean }) => {
    repoManager?.setFavouriteFlag(targetPath, value);
  },
);

ipcMain.handle(
  IPC.DIALOG_PICK_DIRECTORY,
  async (
    _event,
    opts?: { title?: string; defaultPath?: string },
  ): Promise<string | null> => {
    // E2E bypass — tests can pre-load a directory path via env.
    if (process.env.E2E_PICK_DIRECTORY) {
      return process.env.E2E_PICK_DIRECTORY;
    }
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: opts?.title ?? 'Choose directory',
      defaultPath: opts?.defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  },
);

// Settings IPC handlers
ipcMain.handle(IPC.SETTINGS_GET, (): RepoSettings => {
  const current = repoManager?.getCurrentPath();
  if (!current) return { ...DEFAULT_REPO_SETTINGS };
  return loadRepoSettings(current);
});

ipcMain.handle(
  IPC.SETTINGS_UPDATE,
  (_event, patch: DeepPartial<RepoSettings>): RepoSettings => {
    const current = repoManager?.getCurrentPath();
    if (!current) return { ...DEFAULT_REPO_SETTINGS };
    // Renderer applies the same deep-merge optimistically, so skipping the
    // broadcast avoids redundant re-renders that can cause DOM instability
    // mid-interaction (e.g. right-click after click).
    return updateRepoSettings(current, patch);
  },
);

ipcMain.handle(IPC.APP_SETTINGS_GET, (): AppSettings => loadAppSettings());

ipcMain.handle(
  IPC.APP_SETTINGS_UPDATE,
  (_event, patch: DeepPartial<AppSettings>): AppSettings => {
    const next = updateAppSettings(patch);
    // Broadcast so already-open windows (e.g. Repository Browser reading
    // general.projectFolder) can pick up the change without a restart.
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.webContents.send(IPC.APP_SETTINGS_CHANGED, next);
    }
    return next;
  },
);

ipcMain.handle(IPC.WINDOW_SHOW_BROWSER, () => {
  showRepoBrowser();
});

ipcMain.handle(IPC.WINDOW_SHOW_SETTINGS, () => {
  showSettingsWindow();
});

app.on('before-quit', () => {
  flushRepoSettings();
  flushAppSettings();
});

app.on('ready', async () => {
  try {
    const userData = app.getPath('userData');
    configureRepoSettings(userData);
    configureAppSettings(userData);
    const dbPath = path.join(userData, 'repositories.db');
    const db = await createDatabase(dbPath);
    repoManager = new RepoManager(db);
    repoManager.setWindowControls({
      showRepoBrowser,
      focusMainWindow: () => mainWindow?.show(),
      hasMainWindow: () => mainWindow !== null && !mainWindow.isDestroyed(),
      showSettings: () => showSettingsWindow(),
    });

    // E2E + CLI usage: if REPO_PATH is explicitly provided, skip the
    // browser and go straight into the main window for that repo.
    if (process.env.REPO_PATH) {
      await repoManager.openRepo(process.env.REPO_PATH);
      ensureMainWindow();
    } else {
      showRepoBrowser();
    }
  } catch (e) {
    console.error('[main] init error:', e);
  }

  repoManager?.buildMenu();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    showRepoBrowser();
  }
});
