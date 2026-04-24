import { test, expect } from './fixtures/electron-browser';

test.describe('Repository Browser', () => {
  test('opens first at startup with empty state', async ({ browserWindow }) => {
    await expect(browserWindow).toHaveTitle(/Repository Browser/);
    await expect(
      browserWindow.locator('[data-testid="repo-browser-filter"]'),
    ).toBeVisible();
    await expect(
      browserWindow.locator('text=No favourite repositories yet'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Add Existing adds the test repo to the list', async ({
    browserWindow,
    testRepoPath,
  }) => {
    await browserWindow.locator('button', { hasText: 'New' }).click();
    await browserWindow
      .locator('[data-testid="new-menu-add-existing"]')
      .click();
    const row = browserWindow.locator('.row', { hasText: testRepoPath });
    await expect(row).toBeVisible({ timeout: 10_000 });
  });

  test('clicking Open opens the main window and loads the repo', async ({
    electronApp,
    browserWindow,
  }) => {
    // First, add the test repo via the New… menu
    await browserWindow.locator('button', { hasText: 'New' }).click();
    await browserWindow
      .locator('[data-testid="new-menu-add-existing"]')
      .click();
    await expect(browserWindow.locator('.row').first()).toBeVisible({
      timeout: 10_000,
    });

    // Click "Open" on the row
    await browserWindow
      .locator('[data-testid="repo-row-open"]')
      .first()
      .click();

    // Main window should appear
    await expect
      .poll(() => electronApp.windows().length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);

    // Find the main window (second window, or by title) and verify
    // it loaded the commit log.
    const windows = electronApp.windows();
    const mainWin = windows.find((w) => w !== browserWindow);
    if (!mainWin) throw new Error('Main window did not open');
    await mainWin.waitForLoadState('domcontentloaded');
    await expect(
      mainWin.locator('.commit-row', { hasText: 'local only commit' }).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('filter narrows the visible rows', async ({
    browserWindow,
    testRepoPath,
  }) => {
    await browserWindow.locator('button', { hasText: 'New' }).click();
    await browserWindow
      .locator('[data-testid="new-menu-add-existing"]')
      .click();
    await expect(browserWindow.locator('.row').first()).toBeVisible({
      timeout: 10_000,
    });

    await browserWindow
      .locator('[data-testid="repo-browser-filter"]')
      .fill('definitely-not-a-match-xyz');
    await expect(browserWindow.locator('.row')).toHaveCount(0);

    // Filter that matches the repo path
    await browserWindow
      .locator('[data-testid="repo-browser-filter"]')
      .fill(testRepoPath.slice(-10));
    await expect(browserWindow.locator('.row')).toHaveCount(1);
  });

  test('Clone dialog disables submit until URL and destination are valid', async ({
    browserWindow,
  }) => {
    await browserWindow.locator('button', { hasText: 'New' }).click();
    await browserWindow.locator('[data-testid="new-menu-clone"]').click();
    const submit = browserWindow.locator('[data-testid="clone-submit"]');
    await expect(submit).toBeDisabled();

    // Invalid URL → warning + still disabled
    await browserWindow.locator('[data-testid="clone-url"]').fill('not a url');
    await expect(
      browserWindow.locator('[data-testid="clone-warning"]'),
    ).toBeVisible();
    await expect(submit).toBeDisabled();

    // Valid URL + valid destination → submit enabled
    await browserWindow
      .locator('[data-testid="clone-url"]')
      .fill('https://github.com/sindresorhus/is.git');
    await browserWindow.locator('[data-testid="clone-dest"]').fill('/tmp');
    await expect(submit).toBeEnabled();
  });

  test('unfavourite removes the row from the browser list', async ({
    browserWindow,
  }) => {
    // Add existing → lands as favourite
    await browserWindow.locator('button', { hasText: 'New' }).click();
    await browserWindow
      .locator('[data-testid="new-menu-add-existing"]')
      .click();
    await expect(browserWindow.locator('.row').first()).toBeVisible({
      timeout: 10_000,
    });

    // Clicking the star un-favourites → row disappears from the filtered list
    await browserWindow
      .locator('[data-testid="repo-row-unfavourite"]')
      .first()
      .click();
    await expect(browserWindow.locator('.row')).toHaveCount(0, {
      timeout: 5_000,
    });
  });
});
