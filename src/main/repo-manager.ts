import { Menu, dialog, BrowserWindow } from 'electron';
import simpleGit from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import {
  type AppDatabase,
  type Repository,
  addRecentRepo,
  addRepository,
  getRecentRepos,
  clearRecentRepos,
  getFavouriteRepos,
  isFavouriteRepo,
  removeRepository,
  setFavourite,
} from './db';
import { GitService, isGitRepository } from './git-service';
import { flushRepoSettings } from './repo-settings';

export interface RepoListEntry {
  path: string;
  name: string;
  isFavourite: boolean;
  lastOpenedAt: number;
}

export interface WindowControls {
  showRepoBrowser: () => void;
  focusMainWindow: () => void;
  hasMainWindow: () => boolean;
  showSettings: () => void;
}

export class RepoManager {
  private currentPath: string | null = null;
  private gitService: GitService | null = null;
  private windowControls: WindowControls | null = null;

  constructor(private db: AppDatabase) {}

  setWindowControls(controls: WindowControls) {
    this.windowControls = controls;
  }

  /**
   * List repos to show in the Repository Browser. Only favourites — the
   * Browser is a favourites list, not a full history. Non-favourite repos
   * remain in the DB (used by the Repositories > Recent menu).
   */
  loadRepoList(): RepoListEntry[] {
    return getFavouriteRepos(this.db).map((r: Repository) => ({
      path: r.path,
      name: r.name,
      isFavourite: r.isFavourite === 1,
      lastOpenedAt: r.lastOpenedAt,
    }));
  }

  /**
   * Add a repo via the Browser (from "Add Existing", "Clone", "Create
   * Local", or "Scan Directory"). These land as favourites so they
   * immediately appear in the browser list.
   */
  addExistingRepository(repoPath: string): RepoListEntry | null {
    if (!fs.existsSync(repoPath) || !isGitRepository(repoPath)) return null;
    const row = addRepository(this.db, repoPath, { favourite: true });
    this.buildMenu();
    return {
      path: row.path,
      name: row.name,
      isFavourite: row.isFavourite === 1,
      lastOpenedAt: row.lastOpenedAt,
    };
  }

  removeFromList(repoPath: string) {
    removeRepository(this.db, repoPath);
    this.buildMenu();
  }

  setFavouriteFlag(repoPath: string, value: boolean) {
    setFavourite(this.db, repoPath, value);
    this.buildMenu();
  }

  scanForRepositories(rootPath: string, maxDepth = 4): RepoListEntry[] {
    if (!fs.existsSync(rootPath)) return [];
    const found: RepoListEntry[] = [];
    const visit = (dir: string, depth: number) => {
      if (depth > maxDepth) return;
      if (isGitRepository(dir)) {
        const entry = this.addExistingRepository(dir);
        if (entry) found.push(entry);
        return; // don't recurse into a repo
      }
      let entries: string[];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (name.startsWith('.') || name === 'node_modules') continue;
        const full = path.join(dir, name);
        try {
          if (fs.statSync(full).isDirectory()) visit(full, depth + 1);
        } catch {
          // ignore
        }
      }
    };
    visit(rootPath, 0);
    return found;
  }

  getGitService(): GitService | null {
    return this.gitService;
  }

  getCurrentPath(): string | null {
    return this.currentPath;
  }

  async openRepo(repoPath: string): Promise<boolean> {
    // Validate path exists
    if (!fs.existsSync(repoPath)) return false;

    // Validate it's a git repo
    const git = simpleGit(repoPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return false;

    // Update DB
    addRecentRepo(this.db, repoPath);

    // Flush any pending settings writes for the previous repo before switching
    const previousPath = this.currentPath;
    if (previousPath && previousPath !== repoPath) {
      flushRepoSettings(previousPath);
    }

    // Switch
    this.currentPath = repoPath;
    this.gitService = new GitService(git);

    // Update window titles + notify every renderer so both the main window
    // and the repository browser can react.
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('repo:changed', repoPath);
    }
    const title = path.basename(repoPath);
    BrowserWindow.getAllWindows()
      .filter((w) => w.getTitle() !== 'Repository Browser')
      .forEach((w) => w.setTitle(title));

    // Rebuild menu with updated recents
    this.buildMenu();

    return true;
  }

  async openDialog(): Promise<boolean> {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Open Repository',
    });

    if (result.canceled || result.filePaths.length === 0) return false;
    return this.openRepo(result.filePaths[0]);
  }

  buildMenu() {
    const favouriteRepos = getFavouriteRepos(this.db);
    const recentRepos = getRecentRepos(this.db);
    const currentPath = this.currentPath;
    const currentIsFavourite =
      currentPath !== null && isFavouriteRepo(this.db, currentPath);

    const repoMenuItems: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Open Repository...',
        accelerator: 'CmdOrCtrl+O',
        click: () => this.openDialog(),
      },
      { type: 'separator' },
    ];

    // Favourites section
    if (favouriteRepos.length > 0) {
      for (const repo of favouriteRepos) {
        repoMenuItems.push({
          label: repo.path,
          click: () => this.openRepo(repo.path),
        });
      }
    } else {
      repoMenuItems.push({ label: 'No Favourites', enabled: false });
    }
    repoMenuItems.push({ type: 'separator' });

    // Recent — nested submenu
    const recentSubmenu: Electron.MenuItemConstructorOptions[] = [];
    if (recentRepos.length > 0) {
      for (const repo of recentRepos) {
        recentSubmenu.push({
          label: repo.path,
          click: () => this.openRepo(repo.path),
        });
      }
      recentSubmenu.push({ type: 'separator' });
      recentSubmenu.push({
        label: 'Clear Recent Repositories',
        click: () => {
          clearRecentRepos(this.db);
          this.buildMenu();
        },
      });
    } else {
      recentSubmenu.push({
        label: 'No Recent Repositories',
        enabled: false,
      });
    }
    repoMenuItems.push({ label: 'Recent', submenu: recentSubmenu });

    // Add/Remove Current Repository toggle — pinned to the bottom,
    // separated from the repo lists above by a divider.
    repoMenuItems.push({ type: 'separator' });
    if (currentPath === null) {
      repoMenuItems.push({ label: 'No Repository Open', enabled: false });
    } else if (currentIsFavourite) {
      repoMenuItems.push({
        label: 'Remove Current Repository from Favourites',
        click: () => {
          setFavourite(this.db, currentPath, false);
          this.buildMenu();
        },
      });
    } else {
      repoMenuItems.push({
        label: 'Add Current Repository to Favourites',
        click: () => {
          setFavourite(this.db, currentPath, true);
          this.buildMenu();
        },
      });
    }

    const template: Electron.MenuItemConstructorOptions[] = [
      ...(process.platform === 'darwin'
        ? [
            {
              label: 'GitArbor',
              submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                {
                  label: 'Settings…',
                  accelerator: 'Cmd+,',
                  click: () => this.windowControls?.showSettings(),
                },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            },
          ]
        : [
            {
              label: 'File',
              submenu: [
                {
                  label: 'Settings…',
                  accelerator: 'Ctrl+,',
                  click: () => this.windowControls?.showSettings(),
                },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            },
          ]),
      {
        label: 'Repositories',
        submenu: repoMenuItems,
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' as const },
          { role: 'redo' as const },
          { type: 'separator' as const },
          { role: 'cut' as const },
          { role: 'copy' as const },
          { role: 'paste' as const },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' as const },
          { role: 'toggleDevTools' as const },
          { type: 'separator' as const },
          { role: 'resetZoom' as const },
          { role: 'zoomIn' as const },
          { role: 'zoomOut' as const },
          { type: 'separator' as const },
          { role: 'togglefullscreen' as const },
        ],
      },
      {
        label: 'Window',
        submenu: [
          {
            label: 'Show Repository Browser',
            accelerator: 'CmdOrCtrl+Shift+O',
            click: () => this.windowControls?.showRepoBrowser(),
          },
          {
            label: 'Show Main Window',
            enabled: this.windowControls?.hasMainWindow() ?? false,
            click: () => this.windowControls?.focusMainWindow(),
          },
        ],
      },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }
}
