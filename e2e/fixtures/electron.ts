import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';
import path from 'node:path';
import { createTestRepo, type TestRepo } from './test-repo';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  window: Page;
  testRepoPath: string;
  e2eSavePath: string;
};

let testRepo: TestRepo | null = null;

function computeSavePath(repoPath: string): string {
  return path.join(repoPath, '..', 'e2e-save-output');
}

export const test = base.extend<ElectronFixtures>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    // Create fresh temp repo for this test
    testRepo = await createTestRepo();

    const latestBuild = findLatestBuild();
    const appInfo = parseElectronApp(latestBuild);

    const app = await electron.launch({
      args: [appInfo.main],
      executablePath: appInfo.executable,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        REPO_PATH: testRepo.repoPath,
        E2E_SAVE_PATH: computeSavePath(testRepo.repoPath),
      },
    });
    await use(app);
    await app.close();

    // Cleanup temp repo
    testRepo.cleanup();
    testRepo = null;
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.setViewportSize({ width: 800, height: 600 });
    await window.waitForLoadState('domcontentloaded');
    await use(window);
  },

  testRepoPath: async ({ electronApp }, use) => {
    void electronApp; // dependency — ensures testRepo is initialised
    if (!testRepo) throw new Error('testRepo not initialised');
    await use(testRepo.repoPath);
  },

  e2eSavePath: async ({ electronApp }, use) => {
    void electronApp; // dependency — ensures testRepo is initialised
    if (!testRepo) throw new Error('testRepo not initialised');
    await use(computeSavePath(testRepo.repoPath));
  },
});

export { expect } from '@playwright/test';
