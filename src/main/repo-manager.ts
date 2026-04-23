import { Menu, dialog, BrowserWindow } from 'electron';
import simpleGit from 'simple-git';
import fs from 'node:fs';
import {
  type AppDatabase,
  addRecentRepo,
  getRecentRepos,
  clearRecentRepos,
  getFavouriteRepos,
  isFavouriteRepo,
  setFavourite,
} from './db';
import { GitService } from './git-service';
import { flushRepoSettings } from './repo-settings';

export class RepoManager {
  private currentPath: string | null = null;
  private gitService: GitService | null = null;

  constructor(private db: AppDatabase) {}

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

    // Update window title
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.setTitle(`GitArbor — ${repoPath}`);
    }

    // Notify renderer to reload
    const focusedWin = BrowserWindow.getFocusedWindow();
    if (focusedWin) {
      focusedWin.webContents.send('repo:changed', repoPath);
    }

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
                { role: 'quit' as const },
              ],
            },
          ]
        : []),
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
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }
}
