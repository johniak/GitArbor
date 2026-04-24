import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestRepo, type TestRepo } from './test-repo';

/**
 * Fixture for Repository Browser tests.
 *
 * Unlike the main fixture, this one does NOT set REPO_PATH so the Repository
 * Browser window opens as the first window. A temp test repo is still created
 * and its path is surfaced via `testRepoPath` so tests can drive the "Add
 * Existing" flow. `E2E_PICK_DIRECTORY` pre-seeds `showOpenDialog` with that
 * path (native file pickers aren't drivable from Playwright).
 */
type BrowserFixtures = {
  electronApp: ElectronApplication;
  browserWindow: Page;
  testRepoPath: string;
};

let testRepo: TestRepo | null = null;

let userDataDir: string | null = null;

export const test = base.extend<BrowserFixtures>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    testRepo = await createTestRepo();

    // Fresh per-test userData dir so the Repository Browser starts with an
    // empty DB (no favourites / recents leaked across tests).
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitarbor-userdata-'));

    const latestBuild = findLatestBuild();
    const appInfo = parseElectronApp(latestBuild);

    const env: Record<string, string | undefined> = {
      ...process.env,
      NODE_ENV: 'test',
      E2E_PICK_DIRECTORY: testRepo.repoPath,
    };
    delete env.REPO_PATH;

    const app = await electron.launch({
      args: [appInfo.main, `--user-data-dir=${userDataDir}`],
      executablePath: appInfo.executable,
      env,
    });
    await use(app);
    await app.close();

    testRepo.cleanup();
    testRepo = null;
    if (userDataDir && fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
    userDataDir = null;
  },

  browserWindow: async ({ electronApp }, use) => {
    const win = await electronApp.firstWindow();
    await win.setViewportSize({ width: 760, height: 900 });
    await win.waitForLoadState('domcontentloaded');
    await use(win);
  },

  testRepoPath: async ({ electronApp }, use) => {
    void electronApp;
    if (!testRepo) throw new Error('testRepo not initialised');
    await use(testRepo.repoPath);
  },
});

export { expect } from '@playwright/test';
