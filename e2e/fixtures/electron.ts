import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';
import { createTestRepo, type TestRepo } from './test-repo';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  window: Page;
};

let testRepo: TestRepo | null = null;

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
});

export { expect } from '@playwright/test';
