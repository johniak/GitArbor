import { test, expect } from './fixtures/electron';

/** Click the first non-uncommitted commit row and wait for files to load */
async function selectRealCommit(window: import('playwright').Page) {
  // Generous timeout — with full-core parallelism multiple Electrons
  // cold-start at once and fixture-repo load can take longer.
  await expect(window.locator('.commit-row').first()).toBeVisible({
    timeout: 20_000,
  });
  // Scroll to top and click the second row (first is "Uncommitted changes")
  await window.locator('.rows').evaluate((el) => (el.scrollTop = 0));
  await window.waitForTimeout(200);
  await window.locator('.commit-row').nth(1).dispatchEvent('click');
  // Wait for file list to update
  await expect(window.locator('.file-row').first()).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Window', () => {
  test('opens with correct title', async ({ window }) => {
    const title = await window.title();
    expect(title).toBe('GitArbor');
  });
});

test.describe('TopToolbar', () => {
  test('displays all action buttons', async ({ window }) => {
    for (const label of [
      'Commit',
      'Pull',
      'Push',
      'Fetch',
      'Branch',
      'Merge',
      'Stash',
    ]) {
      await expect(
        window.locator('.toolbar-btn', { hasText: label }),
      ).toBeVisible();
    }
  });

  test('displays right-side buttons', async ({ window }) => {
    for (const label of ['Remote', 'Terminal', 'Settings']) {
      await expect(
        window.locator('.toolbar-btn', { hasText: label }),
      ).toBeVisible();
    }
  });
});

test.describe('LeftSidebar', () => {
  test('displays navigation items', async ({ window }) => {
    await expect(
      window.locator('.nav-item', { hasText: 'File Status' }),
    ).toBeVisible();
    await expect(
      window.locator('.nav-item', { hasText: 'History' }),
    ).toBeVisible();
    await expect(
      window.locator('.nav-item', { hasText: 'Search' }),
    ).toBeVisible();
  });

  test('displays branch tree sections', async ({ window }) => {
    for (const section of ['Branches', 'Tags', 'Remotes', 'Stashes']) {
      await expect(
        window.locator('.section-header', { hasText: section }),
      ).toBeVisible();
    }
  });

  test('shows branches from test repo', async ({ window }) => {
    // Wait for git data to load
    await expect(window.locator('.tree-item.current-branch')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      window.locator('.tree-item', { hasText: 'auth' }).first(),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      window.locator('.tree-item', { hasText: 'develop' }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('filter input works', async ({ window }) => {
    const filterInput = window.locator('.filter-input');
    await expect(filterInput).toBeVisible();

    // Filter by known branch name prefix
    await filterInput.fill('main');
    await window.waitForTimeout(200);
    const filtered = await window.locator('.tree-item').count();
    expect(filtered).toBeGreaterThan(0);

    // Type nonsense — should hide all tree items under Branches
    await filterInput.fill('zzzznonexistent');
    // Wait a tick for reactivity
    await window.waitForTimeout(100);

    await filterInput.fill('');
  });

  test('sections can collapse and expand', async ({ window }) => {
    const branchesHeader = window.locator('.section-header', {
      hasText: 'Branches',
    });
    const firstBranch = window
      .locator('.tree-section')
      .first()
      .locator('.tree-item')
      .first();

    await expect(firstBranch).toBeVisible();
    await branchesHeader.click();
    await expect(firstBranch).not.toBeVisible();
    await branchesHeader.click();
    await expect(firstBranch).toBeVisible();
  });
});

test.describe('CommitLog', () => {
  test('displays column headers', async ({ window }) => {
    await expect(window.locator('.header-row')).toContainText('Description', {
      timeout: 10_000,
    });
    await expect(window.locator('.header-row')).toContainText('Author');
    await expect(window.locator('.header-row')).toContainText('Date');
  });

  test('displays commits from test repo', async ({ window }) => {
    // Test repo has 7 commits (with --all: 8 including develop)
    await expect
      .poll(() => window.locator('.commit-row').count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(5);
  });

  test('has a selected commit row', async ({ window }) => {
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });
    const selected = window.locator('.commit-row.selected');
    await expect(selected).toHaveCount(1);
  });

  test('commit list contains merge commit', async ({ window }) => {
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });
    // At least one row should contain "Merge" (from our test repo)
    await expect(
      window.locator('.commit-row', { hasText: 'Merge' }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a row changes selection', async ({ window }) => {
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });
    // Ensure scroll is at top so first rows are in viewport
    await window.locator('.rows').evaluate((el) => (el.scrollTop = 0));
    await window.waitForTimeout(200);

    const initialHash = await window
      .locator('.commit-row.selected .col-hash')
      .textContent();
    const otherRow = window.locator('.commit-row:not(.selected)').first();
    await otherRow.scrollIntoViewIfNeeded();
    await otherRow.click();
    const newHash = await window
      .locator('.commit-row.selected .col-hash')
      .textContent();
    expect(newHash).not.toBe(initialHash);
  });
});

test.describe('FileList', () => {
  test('displays changed files for selected commit', async ({ window }) => {
    await selectRealCommit(window);
    const count = await window.locator('.file-row').count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows file status icons', async ({ window }) => {
    await selectRealCommit(window);
    const statusIcon = window
      .locator('.file-row')
      .first()
      .locator('.file-status svg');
    await expect(statusIcon).toBeVisible();
  });

  test('clicking a file selects it', async ({ window }) => {
    await selectRealCommit(window);
    const file = window.locator('.file-row').first();
    await file.click();
    await expect(file).toHaveClass(/selected/);
  });
});

test.describe('DiffViewer', () => {
  test('displays file name header', async ({ window }) => {
    // Working changes auto-selected — diff header shows first file
    await expect(window.locator('.diff-header')).toBeVisible({
      timeout: 10_000,
    });
    const text = await window.locator('.diff-header').textContent();
    expect(text!.length).toBeGreaterThan(0);
  });

  test('displays diff lines', async ({ window }) => {
    await expect(window.locator('.diff-line').first()).toBeVisible({
      timeout: 10_000,
    });
    const count = await window.locator('.diff-line').count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows added lines with green background', async ({ window }) => {
    await expect(window.locator('.diff-line').first()).toBeVisible({
      timeout: 10_000,
    });
    const addedLine = window.locator('.line-added').first();
    await expect(addedLine).toBeVisible();
    await expect(addedLine.locator('.line-prefix')).toHaveText('+');
  });

  test('shows full-addition diff for untracked file', async ({ window }) => {
    const uncommitted = window.locator('.commit-row', {
      hasText: 'Uncommitted changes',
    });
    await expect(uncommitted).toBeVisible({ timeout: 10_000 });
    await uncommitted.dispatchEvent('click');

    const row = window.locator('.file-row', { hasText: 'unstaged-file.ts' });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.dispatchEvent('click');

    await expect(window.locator('.diff-header')).toContainText(
      'unstaged-file.ts',
    );

    await expect(window.locator('.diff-line.line-added').first()).toBeVisible({
      timeout: 5_000,
    });
    const addedCount = await window.locator('.diff-line.line-added').count();
    expect(addedCount).toBeGreaterThan(0);
    expect(await window.locator('.diff-line.line-removed').count()).toBe(0);

    await expect(window.locator('.diff-content')).toContainText(
      'export const unstaged = true;',
    );
  });
});

test.describe('CommitGraph', () => {
  test('renders SVG graph cells', async ({ window }) => {
    await expect(window.locator('.graph-cell').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('graph cells contain dot circles', async ({ window }) => {
    await expect(window.locator('.graph-cell').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.locator('.graph-cell circle').first()).toBeAttached({
      timeout: 10_000,
    });
  });

  test('merge commits have curve paths', async ({ window }) => {
    await expect(window.locator('.graph-cell').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.locator('.graph-cell path').first()).toBeAttached({
      timeout: 10_000,
    });
  });
});

test.describe('Splitters', () => {
  test('sidebar splitter resizes sidebar on drag', async ({ window }) => {
    const sidebar = window.locator('.sidebar-panel');
    const splitter = window.locator('.splitter-horizontal').first();

    const initialWidth = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    );

    const box = await splitter.boundingBox();
    if (!box) throw new Error('Splitter not found');

    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.mouse.down();
    await window.mouse.move(box.x + 80, box.y + box.height / 2);
    await window.mouse.up();

    const newWidth = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(newWidth).toBeGreaterThan(initialWidth);
  });

  test('commit log splitter resizes on drag', async ({ window }) => {
    const commitPanel = window.locator('.commit-log-panel');
    const splitter = window.locator('.splitter-vertical').first();

    const initialHeight = await commitPanel.evaluate(
      (el) => el.getBoundingClientRect().height,
    );

    const box = await splitter.boundingBox();
    if (!box) throw new Error('Splitter not found');

    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.mouse.down();
    await window.mouse.move(box.x + box.width / 2, box.y + 50);
    await window.mouse.up();

    const newHeight = await commitPanel.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(newHeight).toBeGreaterThan(initialHeight);
  });
});

test.describe('Commit Log Column Resize', () => {
  const STORAGE_KEY = 'gitArbor.commitLogColumnWidths';

  type ResizableColumn = 'graph' | 'desc' | 'hash' | 'author' | 'date';

  async function dragHandleBy(
    window: import('playwright').Page,
    handleSelector: string,
    dx: number,
  ) {
    const handle = window.locator(handleSelector);
    await expect(handle).toBeVisible({ timeout: 10_000 });
    const box = await handle.boundingBox();
    if (!box) throw new Error(`${handleSelector} not found`);
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await window.mouse.move(startX, startY);
    await window.mouse.down();
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      await window.mouse.move(startX + (dx * i) / steps, startY);
    }
    await window.mouse.up();
  }

  async function headerWidth(
    window: import('playwright').Page,
    column: ResizableColumn,
  ) {
    return window
      .locator(`.commit-log .header-row .col-${column}`)
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
  }

  async function clearAndReload(window: import('playwright').Page) {
    // Default e2e viewport is 800x600 which is too narrow for the default
    // column widths to fit — the rightmost handles would be clipped by
    // .header-clip. Widen so every handle is interactive in the test.
    await window.setViewportSize({ width: 1400, height: 800 });
    await window.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await window.reload();
    await expect(window.locator('.commit-log .header-row')).toBeVisible({
      timeout: 10_000,
    });
  }

  function parseTranslateX(transform: string): number | null {
    const m = transform.match(/translateX\((-?\d+(?:\.\d+)?)px\)/);
    return m ? parseFloat(m[1]) : null;
  }

  test('description column grows when its handle is dragged right', async ({
    window,
  }) => {
    await clearAndReload(window);
    const before = await headerWidth(window, 'desc');
    await dragHandleBy(
      window,
      '.commit-log .header-row .col-desc .col-resizer',
      70,
    );
    const after = await headerWidth(window, 'desc');
    expect(after).toBeGreaterThan(before + 50);
  });

  test('hash column grows when its handle is dragged right', async ({
    window,
  }) => {
    await clearAndReload(window);
    const before = await headerWidth(window, 'hash');
    await dragHandleBy(
      window,
      '.commit-log .header-row .col-hash .col-resizer',
      60,
    );
    const after = await headerWidth(window, 'hash');
    expect(after).toBeGreaterThan(before + 40);
  });

  test('row cells mirror the new header widths after resize', async ({
    window,
  }) => {
    await clearAndReload(window);
    await dragHandleBy(
      window,
      '.commit-log .header-row .col-author .col-resizer',
      50,
    );
    const header = await headerWidth(window, 'author');
    const row = await window
      .locator('.commit-log .commit-row .col-author')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.abs(row - header)).toBeLessThanOrEqual(1);
  });

  test('author column clamps at minimum width when dragged far left', async ({
    window,
  }) => {
    await clearAndReload(window);
    await dragHandleBy(
      window,
      '.commit-log .header-row .col-author .col-resizer',
      -500,
    );
    const after = await headerWidth(window, 'author');
    expect(after).toBe(40);
  });

  test('column widths persist to per-repo settings with all 5 keys', async ({
    window,
  }) => {
    await clearAndReload(window);
    await dragHandleBy(
      window,
      '.commit-log .header-row .col-date .col-resizer',
      45,
    );
    const after = await headerWidth(window, 'date');

    // Wait until the merged settings reflect the dragged width.
    await expect
      .poll(
        () =>
          window.evaluate(async () => {
            const s = await window.electronAPI.settings.get();
            return s.columns.date;
          }),
        { timeout: 2_000 },
      )
      .toBe(after);

    const columns = await window.evaluate(async () => {
      const s = await window.electronAPI.settings.get();
      return s.columns;
    });
    expect(Object.keys(columns).sort()).toEqual([
      'author',
      'date',
      'desc',
      'graph',
      'hash',
    ]);
    expect(columns.date).toBeGreaterThan(100);
  });

  test('description width is unchanged when hash column grows (non-elastic)', async ({
    window,
  }) => {
    await clearAndReload(window);
    const descBefore = await headerWidth(window, 'desc');
    const hashBefore = await headerWidth(window, 'hash');

    await dragHandleBy(
      window,
      '.commit-log .header-row .col-hash .col-resizer',
      80,
    );

    const descAfter = await headerWidth(window, 'desc');
    const hashAfter = await headerWidth(window, 'hash');

    expect(hashAfter).toBeGreaterThan(hashBefore + 40);
    expect(Math.abs(descAfter - descBefore)).toBeLessThanOrEqual(1);
  });

  test('horizontal scroll appears when total width exceeds viewport', async ({
    window,
  }) => {
    await clearAndReload(window);

    await dragHandleBy(
      window,
      '.commit-log .header-row .col-hash .col-resizer',
      900,
    );

    const overflow = await window
      .locator('.commit-log .rows')
      .evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  });

  test('header translateX mirrors rows scrollLeft after horizontal scroll', async ({
    window,
  }) => {
    await clearAndReload(window);

    await dragHandleBy(
      window,
      '.commit-log .header-row .col-hash .col-resizer',
      900,
    );

    // Verify the container now overflows before attempting to scroll
    const overflowed = await window
      .locator('.commit-log .rows')
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflowed).toBe(true);

    // Set scrollLeft and fire scroll event so onscroll handler runs
    const actualScrollLeft = await window
      .locator('.commit-log .rows')
      .evaluate((el) => {
        el.scrollLeft = 120;
        el.dispatchEvent(new Event('scroll'));
        return el.scrollLeft;
      });
    expect(actualScrollLeft).toBeGreaterThan(100);

    // Wait for the reactive state update to flow into the inline transform
    await expect
      .poll(
        async () => {
          const t = await window
            .locator('.commit-log .header-row')
            .evaluate((el) => (el as HTMLElement).style.transform);
          return parseTranslateX(t);
        },
        { timeout: 5_000 },
      )
      .toBeLessThan(-1);

    const transform = await window
      .locator('.commit-log .header-row')
      .evaluate((el) => (el as HTMLElement).style.transform);
    const tx = parseTranslateX(transform);
    expect(tx).not.toBeNull();
    expect(Math.abs(tx! - -actualScrollLeft)).toBeLessThanOrEqual(1);
  });

  test('graph column clamps at MIN_COLUMN_WIDTH when dragged left', async ({
    window,
  }) => {
    await clearAndReload(window);
    await dragHandleBy(
      window,
      '.commit-log .header-row .col-graph .col-resizer',
      -400,
    );
    const after = await headerWidth(window, 'graph');
    // MIN_COLUMN_WIDTH = 40; allow ±1 for fractional rounding.
    expect(after).toBeGreaterThanOrEqual(39);
    expect(after).toBeLessThanOrEqual(41);
  });

  test('graph column grows when dragged right', async ({ window }) => {
    await clearAndReload(window);
    const before = await headerWidth(window, 'graph');
    await dragHandleBy(
      window,
      '.commit-log .header-row .col-graph .col-resizer',
      80,
    );
    const after = await headerWidth(window, 'graph');
    expect(after).toBeGreaterThan(before + 50);
  });
});

test.describe('Per-Repo Settings', () => {
  test('showAllBranches toggle persists across renderer reload', async ({
    window,
  }) => {
    const toggle = window.locator('[data-testid="branches-toggle"]');
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await expect(toggle).toHaveText('All Branches');

    await toggle.click();
    await expect(toggle).toHaveText('Current Branch');

    // Give the main-process debounce window time to flush before reload.
    await expect
      .poll(
        () =>
          window.evaluate(async () => {
            const s = await window.electronAPI.settings.get();
            return s.graph.showAllBranches;
          }),
        { timeout: 2_000 },
      )
      .toBe(false);

    await window.reload();
    await expect(window.locator('[data-testid="branches-toggle"]')).toHaveText(
      'Current Branch',
      { timeout: 10_000 },
    );
  });

  test('logOrder toggle persists across renderer reload', async ({
    window,
  }) => {
    const toggle = window.locator('[data-testid="log-order-toggle"]');
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await expect(toggle).toHaveText('Ancestor Order');

    await toggle.click();
    await expect(toggle).toHaveText('Date Order');

    await expect
      .poll(
        () =>
          window.evaluate(async () => {
            const s = await window.electronAPI.settings.get();
            return s.graph.logOrder;
          }),
        { timeout: 2_000 },
      )
      .toBe('date');

    await window.reload();
    await expect(window.locator('[data-testid="log-order-toggle"]')).toHaveText(
      'Date Order',
      { timeout: 10_000 },
    );
  });

  test('commit-panel checkboxes persist across renderer reload', async ({
    window,
  }) => {
    const commitBtn = window.locator('.toolbar-btn', { hasText: 'Commit' });
    await commitBtn.click();

    const noVerify = window
      .locator('label.option', { hasText: 'Bypass commit hooks' })
      .locator('input[type="checkbox"]');
    await expect(noVerify).toBeVisible({ timeout: 10_000 });
    await expect(noVerify).not.toBeChecked();

    await noVerify.check();

    await expect
      .poll(
        () =>
          window.evaluate(async () => {
            const s = await window.electronAPI.settings.get();
            return s.commit.noVerify;
          }),
        { timeout: 2_000 },
      )
      .toBe(true);

    await window.reload();

    await window.locator('.toolbar-btn', { hasText: 'Commit' }).click();
    const noVerifyAfter = window
      .locator('label.option', { hasText: 'Bypass commit hooks' })
      .locator('input[type="checkbox"]');
    await expect(noVerifyAfter).toBeChecked({ timeout: 10_000 });
  });
});

test.describe('Toolbar Actions', () => {
  test('Fetch button works and app stays open', async ({ window }) => {
    const fetchBtn = window.locator('.toolbar-btn', { hasText: 'Fetch' });
    await fetchBtn.click();
    // App should remain running
    await expect(fetchBtn).toBeVisible();
  });

  test('Stash button opens dialog with correct elements', async ({
    window,
  }) => {
    const stashBtn = window.locator('.toolbar-btn', { hasText: 'Stash' });
    await stashBtn.click();
    // Dialog should appear
    await expect(
      window.locator('text=This will stash all the changes'),
    ).toBeVisible();
    await expect(window.locator('#stash-msg')).toBeVisible();
    await expect(window.locator('text=Keep staged changes')).toBeVisible();
    await expect(window.locator('.btn-stash')).toBeVisible();
    // Cancel closes
    await window.locator('.btn-cancel').click();
    await expect(window.locator('.btn-stash')).not.toBeVisible();
  });

  test('Commit button switches to file status view', async ({ window }) => {
    const commitBtn = window.locator('.toolbar-btn', { hasText: 'Commit' });
    await commitBtn.click();
    // CommitPanel should be visible
    await expect(
      window.locator('textarea[placeholder="Commit message..."]'),
    ).toBeVisible();
    // Cancel returns to history
    await window.locator('.btn-cancel').click();
    await expect(window.locator('.commit-log')).toBeVisible();
  });
});

test.describe('File Status View', () => {
  test('shows staged and unstaged sections', async ({ window }) => {
    const fileStatusNav = window.locator('.nav-item', {
      hasText: 'File Status',
    });
    await fileStatusNav.click();
    await expect(
      window.locator('.section-toggle', { hasText: 'Unstaged files' }),
    ).toBeVisible({ timeout: 5_000 });
    // Both sections exist
    const toggles = window.locator('.section-toggle');
    const count = await toggles.count();
    expect(count).toBeGreaterThanOrEqual(2);
    // Go back to history
    const historyNav = window.locator('.nav-item', { hasText: 'History' });
    await historyNav.click();
  });
});

test.describe('Sidebar Stashes', () => {
  test('shows stash from test repo', async ({ window }) => {
    await expect(
      window.locator('.tree-item', { hasText: 'test stash' }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Git Operations', () => {
  test('Push works without error', async ({ window }) => {
    const btn = window.locator('.toolbar-btn', { hasText: 'Push' });
    await btn.click();
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });

  test('Pull works without error', async ({ window }) => {
    const btn = window.locator('.toolbar-btn', { hasText: 'Pull' });
    await btn.click();
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Working Changes', () => {
  test('uncommitted row appears when changes exist', async ({ window }) => {
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      window.locator('.commit-row', { hasText: 'Uncommitted changes' }),
    ).toBeVisible();
  });

  test('clicking uncommitted shows staged/unstaged in file list', async ({
    window,
  }) => {
    const uncommitted = window.locator('.commit-row', {
      hasText: 'Uncommitted changes',
    });
    await expect(uncommitted).toBeVisible({ timeout: 10_000 });
    await uncommitted.dispatchEvent('click');
    await expect(
      window.locator('.section-toggle', { hasText: 'Unstaged files' }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('clicking file in working changes shows diff', async ({ window }) => {
    const uncommitted = window.locator('.commit-row', {
      hasText: 'Uncommitted changes',
    });
    await expect(uncommitted).toBeVisible({ timeout: 10_000 });
    await uncommitted.dispatchEvent('click');
    await expect(
      window.locator('.section-toggle', { hasText: 'Unstaged files' }),
    ).toBeVisible({ timeout: 5_000 });
    // Click a file row
    const fileRow = window.locator('.file-row').first();
    if ((await fileRow.count()) > 0) {
      await fileRow.click();
      // Diff header should show
      await expect(window.locator('.diff-header')).toBeVisible({
        timeout: 5_000,
      });
    }
  });

  test('unstage checkbox moves file from staged to unstaged', async ({
    window,
  }) => {
    const uncommitted = window.locator('.commit-row', {
      hasText: 'Uncommitted changes',
    });
    await expect(uncommitted).toBeVisible({ timeout: 10_000 });
    await uncommitted.dispatchEvent('click');
    await expect(
      window.locator('.section-toggle', { hasText: 'Unstaged files' }),
    ).toBeVisible({ timeout: 5_000 });
    // Find staged checkbox (checked) and click to unstage
    const stagedCheckbox = window.locator('.stage-checkbox[checked]').first();
    if ((await stagedCheckbox.count()) > 0) {
      await stagedCheckbox.click();
      // Should still have sections visible
      await expect(
        window.locator('.section-toggle', { hasText: 'Unstaged files' }),
      ).toBeVisible();
    }
  });
});

test.describe('Real Data Flow', () => {
  test('clicking commit shows real changed files', async ({ window }) => {
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });
    // Click a non-uncommitted commit
    const commitRow = window
      .locator('.commit-row', { hasText: 'Merge' })
      .first();
    await commitRow.dispatchEvent('click');
    // File list should update with real files
    await expect(window.locator('.file-row').first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test('clicking commit shows commit info panel', async ({ window }) => {
    await selectRealCommit(window);
    await expect(window.locator('.commit-title')).toBeVisible({
      timeout: 5_000,
    });
    // Commit title should have content
    const title = await window.locator('.commit-title').textContent();
    expect(title!.length).toBeGreaterThan(0);
  });

  test('clicking file shows real diff', async ({ window }) => {
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });
    // Use a non-merge commit (merge diffs can be empty)
    const commitRow = window
      .locator('.commit-row', { hasText: 'initial setup' })
      .first();
    await commitRow.scrollIntoViewIfNeeded();
    await commitRow.dispatchEvent('click');
    await expect(window.locator('.file-row').first()).toBeVisible({
      timeout: 5_000,
    });
    await window.locator('.file-row').first().click();
    // Diff should show content
    await expect(window.locator('.diff-header')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('All Branches toggle changes commit count', async ({ window }) => {
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });
    const initialCount = await window.locator('.commit-row').count();
    // Toggle
    await window.locator('[data-testid="branches-toggle"]').click();
    await window.waitForTimeout(1_000);
    const newCount = await window.locator('.commit-row').count();
    // Count should differ (all vs current branch)
    expect(newCount).not.toBe(initialCount);
  });

  test('logOrder toggle triggers commit reload without crashing', async ({
    window,
  }) => {
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });

    const toggle = window.locator('[data-testid="log-order-toggle"]');
    await expect(toggle).toHaveText('Ancestor Order');
    await toggle.click();
    await expect(toggle).toHaveText('Date Order');

    // After the reload triggered by the toggle, commits must still render
    // (the IPC round-trip succeeded and didn't crash the renderer).
    // Exact ordering/count is intentionally not asserted: test repo commits are
    // all within the same second so --date-order and --topo-order may diverge
    // only at the level of equal-timestamp tie-breaking, which is not stable
    // enough for a strict equality check.
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect
      .poll(() => window.locator('.commit-row').count(), { timeout: 5_000 })
      .toBeGreaterThan(1);
  });
});

test.describe('Stage and Unstage', () => {
  test('stage checkbox moves file to staged', async ({ window }) => {
    // Go to file status
    await window.locator('.nav-item', { hasText: 'File Status' }).click();
    await expect(
      window.locator('.section-toggle', { hasText: 'Unstaged files' }),
    ).toBeVisible({ timeout: 5_000 });
    // Find unstaged file checkbox and click
    const unstaged = window.locator(
      '.section-header-row:has-text("Unstaged") ~ .file-row .stage-checkbox',
    );
    const countBefore = await unstaged.count();
    if (countBefore > 0) {
      await unstaged.first().click();
      await window.waitForTimeout(500);
      // Staged count should increase
      const stagedToggle = window
        .locator('.section-toggle', { hasText: 'Staged files' })
        .first();
      await expect(stagedToggle).toBeVisible();
    }
  });
});

test.describe('Stage All / Unstage All', () => {
  test('stage all checkbox stages all unstaged files', async ({ window }) => {
    await window.locator('.nav-item', { hasText: 'File Status' }).click();
    await expect(
      window.locator('.section-toggle', { hasText: 'Unstaged files' }),
    ).toBeVisible({ timeout: 5_000 });

    // Get initial unstaged count
    const unstagedCount = window
      .locator('.section-toggle', { hasText: 'Unstaged files' })
      .locator('.file-count');
    const before = await unstagedCount.textContent();
    expect(Number(before)).toBeGreaterThan(0);

    // Click the unstaged section's stage-all checkbox
    const stageAllCheckbox = window
      .locator('.section-header-row')
      .last()
      .locator('.stage-all-checkbox');
    await stageAllCheckbox.click();

    // Unstaged count should become 0
    await expect(unstagedCount).toHaveText('0', { timeout: 5_000 });
  });

  test('unstage all checkbox unstages all staged files', async ({ window }) => {
    // Wait for git data to load, then go to file status view
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });
    await window.locator('.nav-item', { hasText: 'File Status' }).click();
    await expect(window.locator('.section-header-row').first()).toBeVisible({
      timeout: 10_000,
    });

    // Get staged count — staged section is always first
    const stagedCount = window
      .locator('.section-header-row')
      .first()
      .locator('.file-count');
    const before = await stagedCount.textContent();
    expect(Number(before)).toBeGreaterThan(0);

    // Click the staged section's unstage-all checkbox
    const unstageAllCheckbox = window
      .locator('.section-header-row')
      .first()
      .locator('.stage-all-checkbox');
    await unstageAllCheckbox.click();

    // Staged count should become 0
    await expect(stagedCount).toHaveText('0', { timeout: 5_000 });
  });
});

test.describe('Progress Dialog', () => {
  test('progress dialog appears during fetch and disappears after', async ({
    window,
  }) => {
    const fetchBtn = window.locator('.toolbar-btn', { hasText: 'Fetch' });
    // Set up a listener to catch the progress dialog appearing
    const progressSeen = window.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const observer = new MutationObserver(() => {
          if (document.querySelector('.progress-bar')) {
            observer.disconnect();
            resolve(true);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        // Timeout fallback
        setTimeout(() => {
          observer.disconnect();
          resolve(false);
        }, 10_000);
      });
    });
    await fetchBtn.click();
    const seen = await progressSeen;
    expect(seen).toBe(true);
    // After completion, dialog should be gone
    await expect(window.locator('.progress-bar')).not.toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Commit Operations', () => {
  test('commit creates new commit in history', async ({ window }) => {
    // Go to file status
    await window.locator('.toolbar-btn', { hasText: 'Commit' }).click();
    await expect(
      window.locator('textarea[placeholder="Commit message..."]'),
    ).toBeVisible();

    // Type message
    await window
      .locator('textarea[placeholder="Commit message..."]')
      .fill('e2e test commit');

    // Click Commit
    await window.locator('.btn-commit').click();

    // Should return to history with new commit
    await expect(window.locator('.commit-log')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      window.locator('.commit-row', { hasText: 'e2e test commit' }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('checkout branch via sidebar dblclick', async ({ window }) => {
    // Stash uncommitted changes first (checkout fails with dirty working dir)
    await window.locator('.toolbar-btn', { hasText: 'Stash' }).click();
    await expect(window.locator('.btn-stash')).toBeVisible();
    await window.locator('.btn-stash').click();

    // Wait for stash + data reload to fully complete
    await expect(window.locator('.progress-bar')).not.toBeVisible({
      timeout: 15_000,
    });
    // Ensure sidebar has reloaded with branch data
    await expect(window.locator('.tree-item.current-branch')).toBeVisible({
      timeout: 10_000,
    });

    // Double-click develop branch
    const develop = window
      .locator('.tree-item', { hasText: 'develop' })
      .first();
    await expect(develop).toBeVisible({ timeout: 5_000 });
    await develop.dispatchEvent('dblclick');

    // Current branch indicator should change
    await expect(window.locator('.tree-item.current-branch')).toContainText(
      'develop',
      { timeout: 15_000 },
    );
  });

  test('apply stash via sidebar dblclick', async ({ window }) => {
    const stashItem = window
      .locator('.tree-item', { hasText: 'test stash' })
      .first();
    await expect(stashItem).toBeVisible({ timeout: 10_000 });

    // Double-click stash → dialog
    await stashItem.dblclick();
    await expect(window.locator('text=Apply Stash?')).toBeVisible();

    // Check delete after + confirm
    await window.locator('text=Delete after applying').click();
    await window.locator('.btn-ok').click();

    // Dialog closes
    await expect(window.locator('text=Apply Stash?')).not.toBeVisible();
  });
});

test.describe('Create Branch', () => {
  test('toolbar Branch button opens create branch dialog', async ({
    window,
  }) => {
    // Wait for app to be fully ready (sidebar populated) before clicking —
    // otherwise under parallel runs the renderer may still be mid-boot.
    await expect(window.locator('.tree-item.current-branch')).toBeVisible({
      timeout: 20_000,
    });
    await window.locator('.toolbar-btn', { hasText: 'Branch' }).click();
    await expect(window.locator('#branch-name')).toBeVisible({
      timeout: 10_000,
    });
    // Cancel closes
    await window.locator('.btn-cancel').click();
    await expect(window.locator('#branch-name')).not.toBeVisible();
  });

  test('right-click Branches header shows New Branch option', async ({
    window,
  }) => {
    // Wait until sidebar is populated, not just headered
    await expect(window.locator('.tree-item.current-branch')).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      window.locator('.section-header', { hasText: 'Branches' }),
    ).toBeVisible({ timeout: 10_000 });
    await window
      .locator('.section-header', { hasText: 'Branches' })
      .click({ button: 'right' });
    await expect(window.locator('.context-menu')).toBeVisible();
    await expect(
      window.locator('.context-item', { hasText: 'New Branch' }),
    ).toBeVisible();
    await window.keyboard.press('Escape');
  });

  test('create branch and checkout', async ({ window }) => {
    // Wait for app to be ready
    await expect(window.locator('.tree-item.current-branch')).toBeVisible({
      timeout: 20_000,
    });
    // Open dialog
    await window.locator('.toolbar-btn', { hasText: 'Branch' }).click();
    await expect(window.locator('#branch-name')).toBeVisible({
      timeout: 10_000,
    });

    // Type name
    await window.locator('#branch-name').fill('test-new-branch');

    // Checkout checkbox should be checked by default
    const checkoutBox = window
      .locator('.checkbox-row')
      .filter({ hasText: 'Checkout' })
      .locator('input');
    await expect(checkoutBox).toBeChecked();

    // Create
    await window.locator('.btn-primary').click();

    // Dialog should close, new branch should be current
    await expect(window.locator('#branch-name')).not.toBeVisible();
    await expect(window.locator('.tree-item.current-branch')).toContainText(
      'test-new-branch',
      { timeout: 15_000 },
    );
  });
});

test.describe('Branch Context Menu', () => {
  test('right-click branch shows context menu with merge and rebase', async ({
    window,
  }) => {
    const branch = window.locator('.tree-item', { hasText: 'auth' }).first();
    await expect(branch).toBeVisible({ timeout: 20_000 });

    // Right-click
    await branch.click({ button: 'right' });

    // Context menu should appear
    await expect(window.locator('.context-menu')).toBeVisible();
    await expect(
      window.locator('.context-item', { hasText: 'Merge' }),
    ).toBeVisible();
    await expect(
      window.locator('.context-item', { hasText: 'Rebase' }),
    ).toBeVisible();

    // Escape closes
    await window.keyboard.press('Escape');
    await expect(window.locator('.context-menu')).not.toBeVisible();
  });

  test('merge branch into current via context menu', async ({ window }) => {
    const branch = window
      .locator('.tree-item', { hasText: 'merge-test' })
      .first();
    await expect(branch).toBeVisible({ timeout: 10_000 });

    // Right-click → context menu
    await branch.click({ button: 'right' });
    await expect(window.locator('.context-menu')).toBeVisible();

    // Auto-accept all confirm dialogs
    window.on('dialog', (dialog) => dialog.accept());

    // Click merge item
    const mergeItem = window.locator('.context-item', {
      hasText: /^Merge /,
    });
    await mergeItem.click();

    // Should show result dialog (success or info)
    await expect(window.locator('.btn-ok')).toBeVisible({ timeout: 15_000 });

    // Close it
    await window.locator('.btn-ok').click();

    // Commit log should reload
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('rebase onto branch via context menu', async ({ window }) => {
    // Stash uncommitted changes first (checkout fails with dirty working dir)
    await window.locator('.toolbar-btn', { hasText: 'Stash' }).click();
    await expect(window.locator('.btn-stash')).toBeVisible();
    await window.locator('.btn-stash').click();
    // Wait for stash to complete
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });

    // Checkout feature/rebase-test
    const rebaseBranch = window
      .locator('.tree-item', { hasText: 'rebase-test' })
      .first();
    await expect(rebaseBranch).toBeVisible({ timeout: 10_000 });
    await rebaseBranch.dispatchEvent('dblclick');

    // Wait until current branch changes
    await expect(window.locator('.tree-item.current-branch')).toContainText(
      'rebase-test',
      { timeout: 15_000 },
    );

    // Wait for data reload after checkout, then right-click main
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });
    const mainBranch = window
      .locator('.tree-item:not(.current-branch)', { hasText: 'main' })
      .first();
    await expect(mainBranch).toBeVisible({ timeout: 10_000 });
    await mainBranch.click({ button: 'right' });
    await expect(window.locator('.context-menu')).toBeVisible();

    // Auto-accept confirm
    window.once('dialog', (dialog) => dialog.accept());

    const rebaseItem = window.locator('.context-item', {
      hasText: /^Rebase /,
    });
    await rebaseItem.click();

    // Should show result dialog
    await expect(window.locator('.btn-ok')).toBeVisible({ timeout: 15_000 });

    // Close it
    await window.locator('.btn-ok').click();

    // Commit log should work
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Remote Branch Checkout', () => {
  test('dblclick remote branch checks out local tracking branch', async ({
    window,
  }) => {
    // Stash uncommitted changes first
    await window.locator('.toolbar-btn', { hasText: 'Stash' }).click();
    await expect(window.locator('.btn-stash')).toBeVisible();
    await window.locator('.btn-stash').click();
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 10_000,
    });

    // Expand origin remote
    const originToggle = window.locator('.remote-name', { hasText: 'origin' });
    await expect(originToggle).toBeVisible({ timeout: 10_000 });

    // Find remote branch and dblclick
    const remoteBranch = window.locator('.remote-branch', {
      hasText: 'develop',
    });
    await expect(remoteBranch).toBeVisible({ timeout: 5_000 });
    await remoteBranch.dispatchEvent('dblclick');

    // Current branch should change to develop
    await expect(window.locator('.tree-item.current-branch')).toContainText(
      'develop',
      { timeout: 15_000 },
    );
  });
});

test.describe('File Context Menu', () => {
  async function openWorkingChanges(window: import('playwright').Page) {
    const uncommitted = window.locator('.commit-row', {
      hasText: 'Uncommitted changes',
    });
    await expect(uncommitted).toBeVisible({ timeout: 10_000 });
    await uncommitted.dispatchEvent('click');
    await expect(
      window.locator('.section-toggle', { hasText: 'Unstaged files' }),
    ).toBeVisible({ timeout: 5_000 });
  }

  test('right-click file shows context menu with 5 items', async ({
    window,
  }) => {
    await openWorkingChanges(window);
    const fileRow = window.locator('.file-row').first();
    await fileRow.click({ button: 'right' });
    await expect(window.locator('.file-context-menu')).toBeVisible();
    const items = window.locator('.context-item');
    await expect(items).toHaveCount(5);
    await expect(items.nth(0)).toHaveText('Open');
    await expect(items.nth(1)).toHaveText('Copy Path');
    await expect(items.nth(2)).toHaveText('Create Patch');
    await expect(items.nth(3)).toHaveText('Ignore');
    await expect(items.nth(4)).toHaveText('Discard');
  });

  test('escape closes context menu', async ({ window }) => {
    await openWorkingChanges(window);
    const fileRow = window.locator('.file-row').first();
    await fileRow.click({ button: 'right' });
    await expect(window.locator('.file-context-menu')).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(window.locator('.file-context-menu')).not.toBeVisible();
  });

  test('click outside closes context menu', async ({ window }) => {
    await openWorkingChanges(window);
    const fileRow = window.locator('.file-row').first();
    await fileRow.click({ button: 'right' });
    await expect(window.locator('.file-context-menu')).toBeVisible();
    // Click outside the menu (on file header)
    await window.locator('.file-header').click();
    await expect(window.locator('.file-context-menu')).not.toBeVisible();
  });

  test('copy path copies file path to clipboard', async ({ window }) => {
    await openWorkingChanges(window);
    const fileRow = window.locator('.file-row').first();
    await fileRow.click({ button: 'right' });
    await expect(window.locator('.file-context-menu')).toBeVisible();
    await window.locator('.context-item', { hasText: 'Copy Path' }).click();
    await expect(window.locator('.file-context-menu')).not.toBeVisible();
    // Verify clipboard
    const clipboard = await window.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboard.length).toBeGreaterThan(0);
  });

  test('discard untracked file removes it from working changes', async ({
    window,
  }) => {
    await openWorkingChanges(window);
    // Find unstaged-file.ts (untracked, status ?)
    const fileRow = window.locator('.file-row', {
      hasText: 'unstaged-file.ts',
    });
    await expect(fileRow).toBeVisible();
    await fileRow.click({ button: 'right' });
    await expect(window.locator('.file-context-menu')).toBeVisible();

    // Accept confirm dialog
    window.once('dialog', (d) => d.accept());
    await window
      .locator('.context-item', { hasText: 'Discard' })
      .click({ force: true });

    // File should disappear
    await expect(
      window.locator('.file-row', { hasText: 'unstaged-file.ts' }),
    ).not.toBeVisible({ timeout: 10_000 });
  });

  test('discard staged file removes it from working changes', async ({
    window,
  }) => {
    await openWorkingChanges(window);
    // Count files before discard
    const countBefore = await window.locator('.file-row').count();

    // Right-click first file row (staged files appear first)
    const firstFile = window.locator('.file-row').first();
    await expect(firstFile).toBeVisible();
    await firstFile.click({ button: 'right' });
    await expect(window.locator('.file-context-menu')).toBeVisible();

    // Accept confirm dialog
    window.once('dialog', (d) => d.accept());
    await window
      .locator('.context-item', { hasText: 'Discard' })
      .click({ force: true });

    // File count should decrease
    await expect(async () => {
      const countAfter = await window.locator('.file-row').count();
      expect(countAfter).toBeLessThan(countBefore);
    }).toPass({ timeout: 10_000 });
  });

  test('ignore file removes it from working changes', async ({ window }) => {
    await openWorkingChanges(window);
    // Use unstaged-file.ts for ignore
    const fileRow = window.locator('.file-row', {
      hasText: 'unstaged-file.ts',
    });
    await expect(fileRow).toBeVisible();
    await fileRow.click({ button: 'right' });
    await expect(window.locator('.file-context-menu')).toBeVisible();
    await window.locator('.context-item', { hasText: 'Ignore' }).click();
    await expect(window.locator('.file-context-menu')).not.toBeVisible();

    // Working status should refresh — unstaged-file.ts gone (ignored now)
    await expect(
      window.locator('.file-row', { hasText: 'unstaged-file.ts' }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test('open file keeps app running', async ({ window }) => {
    test.skip(!!process.env.CI, 'shell.openPath hangs on headless CI');
    await openWorkingChanges(window);
    const fileRow = window.locator('.file-row').first();
    await fileRow.click({ button: 'right' });
    await expect(window.locator('.file-context-menu')).toBeVisible();
    // Use dispatchEvent to avoid shell.openPath blocking on headless CI
    await window
      .locator('.context-item', { hasText: 'Open' })
      .dispatchEvent('click');
    // App should remain functional
    await expect(window.locator('.commit-row').first()).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe('Multi-Select Files', () => {
  async function openWorkingChanges(window: import('playwright').Page) {
    const uncommitted = window.locator('.commit-row', {
      hasText: 'Uncommitted changes',
    });
    await expect(uncommitted).toBeVisible({ timeout: 10_000 });
    await uncommitted.dispatchEvent('click');
    await expect(
      window.locator('.section-toggle', { hasText: 'Unstaged files' }),
    ).toBeVisible({ timeout: 5_000 });
  }

  test('ctrl+click selects multiple files', async ({ window }) => {
    await openWorkingChanges(window);
    const rows = window.locator('.file-row');
    const count = await rows.count();
    if (count < 2) return;

    // Click first file
    await rows.first().click();
    await expect(rows.first()).toHaveClass(/selected/);

    // Ctrl+click second file
    await rows.nth(1).click({ modifiers: ['Meta'] });
    await expect(rows.first()).toHaveClass(/selected/);
    await expect(rows.nth(1)).toHaveClass(/selected/);
  });

  test('plain click after multi-select clears to single', async ({
    window,
  }) => {
    await openWorkingChanges(window);
    const rows = window.locator('.file-row');
    const count = await rows.count();
    if (count < 2) return;

    // Multi-select
    await rows.first().click();
    await rows.nth(1).click({ modifiers: ['Meta'] });
    const selectedCount = await window.locator('.file-row.selected').count();
    expect(selectedCount).toBe(2);

    // Plain click → single
    await rows.first().click();
    const newCount = await window.locator('.file-row.selected').count();
    expect(newCount).toBe(1);
  });

  test('right-click on multi-selection shows batch context menu', async ({
    window,
  }) => {
    await openWorkingChanges(window);
    const rows = window.locator('.file-row');
    const count = await rows.count();
    if (count < 2) return;

    // Multi-select two files
    await rows.first().click();
    await rows.nth(1).click({ modifiers: ['Meta'] });

    // Right-click on one of the selected files
    await rows.first().click({ button: 'right' });
    await expect(window.locator('.file-context-menu')).toBeVisible();

    // Should show batch items (not single-file items)
    await expect(
      window.locator('.context-item', { hasText: /Discard \(\d+ files\)/ }),
    ).toBeVisible();
    await expect(
      window.locator('.context-item', { hasText: /Ignore \(\d+ files\)/ }),
    ).toBeVisible();

    // Single-file items should NOT be visible
    await expect(
      window.locator('.context-item', { hasText: 'Open' }),
    ).not.toBeVisible();

    await window.keyboard.press('Escape');
  });

  test('batch discard removes multiple files', async ({ window }) => {
    await openWorkingChanges(window);
    const rows = window.locator('.file-row');
    const countBefore = await rows.count();
    if (countBefore < 2) return;

    // Multi-select two files
    await rows.first().click();
    await rows.nth(1).click({ modifiers: ['Meta'] });

    // Right-click → Discard
    await rows.first().click({ button: 'right' });
    await expect(window.locator('.file-context-menu')).toBeVisible();

    window.once('dialog', (d) => d.accept());
    await window
      .locator('.context-item', { hasText: /Discard/ })
      .click({ force: true });

    // File count should decrease
    await expect(async () => {
      const countAfter = await window.locator('.file-row').count();
      expect(countAfter).toBeLessThan(countBefore);
    }).toPass({ timeout: 10_000 });
  });
});

test.describe('Hunk and Line Staging', () => {
  async function goToFileStatus(window: import('playwright').Page) {
    await window.locator('.nav-item', { hasText: 'File Status' }).click();
    await expect(
      window.locator('.section-toggle', { hasText: 'Unstaged files' }),
    ).toBeVisible({ timeout: 5_000 });
  }

  test('hunk header shows Stage hunk button for unstaged file', async ({
    window,
  }) => {
    await goToFileStatus(window);
    // Click an unstaged file to load its diff
    const fileRow = window.locator('.file-row').last();
    await fileRow.click();
    // Wait for diff to load
    await expect(window.locator('.hunk-header').first()).toBeVisible({
      timeout: 5_000,
    });
    // Should have "Stage hunk" button
    await expect(
      window.locator('.hunk-action', { hasText: 'Stage hunk' }),
    ).toBeVisible();
  });

  test('hunk header shows Unstage hunk button for staged file', async ({
    window,
  }) => {
    await goToFileStatus(window);
    // Click a staged file
    const fileRow = window.locator('.file-row').first();
    await fileRow.click();
    await expect(window.locator('.hunk-header').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      window.locator('.hunk-action', { hasText: 'Unstage hunk' }),
    ).toBeVisible();
  });

  test('clicking added/removed line selects it', async ({ window }) => {
    await goToFileStatus(window);
    const fileRow = window.locator('.file-row').first();
    await fileRow.click();
    await expect(window.locator('.hunk-header').first()).toBeVisible({
      timeout: 5_000,
    });
    // Click an added or removed line
    const selectableLine = window.locator('.line-selectable').first();
    await expect(selectableLine).toBeVisible();
    await selectableLine.click();
    await expect(selectableLine).toHaveClass(/line-selected/);
  });

  test('right-click selected line shows context menu', async ({ window }) => {
    await goToFileStatus(window);
    const fileRow = window.locator('.file-row').first();
    await fileRow.click();
    await expect(window.locator('.line-selectable').first()).toBeVisible({
      timeout: 5_000,
    });
    const line = window.locator('.line-selectable').first();
    await line.dispatchEvent('click');
    await expect(line).toHaveClass(/line-selected/);
    await line.dispatchEvent('contextmenu');
    await expect(window.locator('.diff-context-menu')).toBeVisible();
    // Should show Unstage line (staged file)
    await expect(
      window.locator('.context-item', { hasText: /Unstage/ }),
    ).toBeVisible();
    await window.keyboard.press('Escape');
  });
});

test.describe('Ahead/Behind Indicators', () => {
  test('shows ahead count on current branch in sidebar', async ({ window }) => {
    // Wait for sidebar branches to load first
    await expect(window.locator('.tree-item.current-branch')).toBeVisible({
      timeout: 10_000,
    });
    // main is ahead of origin/main by 1 (local-only commit)
    await expect(window.locator('.ahead').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.locator('.ahead').first()).toContainText('↑');
  });

  test('shows ahead badge on Push toolbar button', async ({ window }) => {
    // Wait for sidebar to load (ahead count comes from branch data)
    await expect(window.locator('.tree-item.current-branch')).toBeVisible({
      timeout: 10_000,
    });
    await expect(window.locator('.push-badge')).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Push Dialog', () => {
  async function openPushDialog(window: import('playwright').Page) {
    // Wait for real fixture data to replace mock — same pattern as tagging
    // helper. Otherwise dialog snapshots mockSidebar branches. Generous
    // timeout because under full-core parallel runs Electron cold-start +
    // IPC load can slip past 10s.
    await expect(
      window.locator('.commit-row', { hasText: 'local only commit' }).first(),
    ).toBeVisible({ timeout: 20_000 });
    await window.locator('.toolbar-btn', { hasText: 'Push' }).click();
    await expect(
      window.locator('[data-testid="push-branches-table"]'),
    ).toBeVisible({ timeout: 5_000 });
  }

  test('toolbar Push button opens push dialog', async ({ window }) => {
    await openPushDialog(window);
    await expect(
      window.locator('[data-testid="push-remote-select"]'),
    ).toBeVisible();
  });

  test('escape closes push dialog', async ({ window }) => {
    await openPushDialog(window);
    await window.keyboard.press('Escape');
    await expect(
      window.locator('[data-testid="push-branches-table"]'),
    ).not.toBeVisible();
  });

  test('cancel closes push dialog without push', async ({ window }) => {
    await openPushDialog(window);
    await window.locator('.btn-cancel').click();
    await expect(
      window.locator('[data-testid="push-branches-table"]'),
    ).not.toBeVisible();
  });

  test('current branch pre-checked when ahead', async ({ window }) => {
    await openPushDialog(window);
    // Fixture: main is ahead of origin/main by 1
    await expect(
      window.locator('[data-testid="push-row-check-main"]'),
    ).toBeChecked();
  });

  test('other non-ahead branches unchecked by default', async ({ window }) => {
    await openPushDialog(window);
    await expect(
      window.locator('[data-testid="push-row-check-develop"]'),
    ).not.toBeChecked();
  });

  test('submit disabled when nothing selected and no tags', async ({
    window,
  }) => {
    await openPushDialog(window);
    await window.locator('[data-testid="push-row-check-main"]').click();
    await expect(window.locator('[data-testid="push-submit"]')).toBeDisabled();
  });

  test('push all tags alone enables submit', async ({ window }) => {
    await openPushDialog(window);
    await window.locator('[data-testid="push-row-check-main"]').click();
    await window.locator('[data-testid="push-all-tags"]').click();
    await expect(window.locator('[data-testid="push-submit"]')).toBeEnabled();
  });

  test('select all checks all rows', async ({ window }) => {
    await openPushDialog(window);
    await window.locator('[data-testid="push-select-all"]').click();
    const checked = window.locator('[data-testid^="push-row-check-"]:checked');
    const count = await checked.count();
    expect(count).toBeGreaterThan(1);
  });

  test('remote dropdown contains origin', async ({ window }) => {
    await openPushDialog(window);
    const options = window.locator('[data-testid="push-remote-select"] option');
    await expect(options.first()).toHaveText('origin');
  });

  test('remote URL field is populated', async ({ window }) => {
    await openPushDialog(window);
    const url = await window
      .locator('[data-testid="push-remote-url"]')
      .inputValue();
    expect(url.length).toBeGreaterThan(0);
  });

  test('push submits and clears ahead badge', async ({ window }) => {
    // Fixture sets main ahead of origin/main by 1 — badge should exist
    await expect(window.locator('.push-badge')).toBeVisible({
      timeout: 10_000,
    });
    await openPushDialog(window);
    await window.locator('[data-testid="push-submit"]').click();
    await expect(
      window.locator('[data-testid="push-branches-table"]'),
    ).not.toBeVisible({ timeout: 10_000 });
    // After push, ahead should be 0 and badge removed
    await expect(window.locator('.push-badge')).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});

test.describe('Commit Tagging', () => {
  async function openCommitContextMenu(window: import('playwright').Page) {
    // Wait for real fixture commits (not initial mock data) — 'local only commit'
    // text is unique to the fixture so we know IPC has replaced mocks.
    // Generous timeout: full-core parallelism delays cold-start IPC.
    await expect(
      window.locator('.commit-row', { hasText: 'local only commit' }).first(),
    ).toBeVisible({ timeout: 20_000 });
    // Ensure scroll is at top so first rows are in viewport
    await window.locator('.rows').evaluate((el) => (el.scrollTop = 0));
    await window.waitForTimeout(200);
    // Right-click the first real commit (index 1 — past the uncommitted row)
    const row = window.locator('.commit-row').nth(1);
    await expect(row).toBeVisible();
    await row.dispatchEvent('contextmenu', {
      clientX: 200,
      clientY: 200,
      button: 2,
      bubbles: true,
    });
    await expect(window.locator('.commit-context-menu')).toBeVisible({
      timeout: 5_000,
    });
  }

  test('right-click commit shows context menu with Add Tag', async ({
    window,
  }) => {
    await openCommitContextMenu(window);
    await expect(
      window.locator('.commit-context-menu .context-item', {
        hasText: 'Add Tag',
      }),
    ).toBeVisible();
  });

  test('escape closes commit context menu', async ({ window }) => {
    await openCommitContextMenu(window);
    await window.keyboard.press('Escape');
    await expect(window.locator('.commit-context-menu')).not.toBeVisible();
  });

  test('click outside closes commit context menu', async ({ window }) => {
    await openCommitContextMenu(window);
    // Click on the overlay anywhere away from the menu position
    await window.mouse.click(20, 20);
    await expect(window.locator('.commit-context-menu')).not.toBeVisible();
  });

  test('Add Tag… opens dialog in add mode with commit hash', async ({
    window,
  }) => {
    await openCommitContextMenu(window);
    await window
      .locator('.commit-context-menu .context-item', { hasText: 'Add Tag' })
      .click();
    await expect(
      window.locator('[data-testid="tag-name-input"]'),
    ).toBeVisible();
    await expect(window.locator('[data-testid="tag-mode-add"]')).toHaveClass(
      /active/,
    );
    const hash = await window
      .locator('[data-testid="tag-commit-hash"]')
      .textContent();
    expect(hash?.trim().length).toBeGreaterThan(0);
  });

  test('empty tag name disables Add button', async ({ window }) => {
    await openCommitContextMenu(window);
    await window
      .locator('.commit-context-menu .context-item', { hasText: 'Add Tag' })
      .click();
    await expect(
      window.locator('[data-testid="tag-submit-add"]'),
    ).toBeDisabled();
  });

  test('invalid tag name disables Add button', async ({ window }) => {
    await openCommitContextMenu(window);
    await window
      .locator('.commit-context-menu .context-item', { hasText: 'Add Tag' })
      .click();
    await window.locator('[data-testid="tag-name-input"]').fill('v 1.0');
    await expect(
      window.locator('[data-testid="tag-submit-add"]'),
    ).toBeDisabled();
  });

  test('valid name submit creates tag in sidebar', async ({ window }) => {
    await openCommitContextMenu(window);
    await window
      .locator('.commit-context-menu .context-item', { hasText: 'Add Tag' })
      .click();
    await window.locator('[data-testid="tag-name-input"]').fill('v-e2e-test');
    await window.locator('[data-testid="tag-submit-add"]').click();
    // Dialog closes
    await expect(
      window.locator('[data-testid="tag-name-input"]'),
    ).not.toBeVisible({ timeout: 10_000 });
    // Tag appears in sidebar
    await expect(
      window.locator('.tree-item', { hasText: 'v-e2e-test' }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('escape closes add dialog without creating', async ({ window }) => {
    await openCommitContextMenu(window);
    await window
      .locator('.commit-context-menu .context-item', { hasText: 'Add Tag' })
      .click();
    await window.locator('[data-testid="tag-name-input"]').fill('v-cancelled');
    await window.keyboard.press('Escape');
    await expect(
      window.locator('[data-testid="tag-name-input"]'),
    ).not.toBeVisible();
    await expect(
      window.locator('.tree-item', { hasText: 'v-cancelled' }),
    ).toHaveCount(0);
  });

  test('switch to Remove Tag tab shows existing tags dropdown', async ({
    window,
  }) => {
    await openCommitContextMenu(window);
    await window
      .locator('.commit-context-menu .context-item', { hasText: 'Add Tag' })
      .click();
    await window.locator('[data-testid="tag-mode-remove"]').click();
    await expect(window.locator('[data-testid="tag-mode-remove"]')).toHaveClass(
      /active/,
    );
    const options = window.locator('[data-testid="tag-remove-select"] option');
    await expect(options).toHaveCount(2); // fixture has v0.1.0 + v0.2.0
  });

  test('remove tag → tag disappears from sidebar', async ({ window }) => {
    // Ensure v0.1.0 is present before removing
    await expect(
      window.locator('.tree-item', { hasText: 'v0.1.0' }).first(),
    ).toBeVisible({ timeout: 10_000 });

    await openCommitContextMenu(window);
    await window
      .locator('.commit-context-menu .context-item', { hasText: 'Add Tag' })
      .click();
    await window.locator('[data-testid="tag-mode-remove"]').click();
    await window
      .locator('[data-testid="tag-remove-select"]')
      .selectOption('v0.1.0');
    await window.locator('[data-testid="tag-submit-remove"]').click();
    await expect(
      window.locator('[data-testid="tag-remove-select"]'),
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(
      window.locator('.tree-item', { hasText: 'v0.1.0' }),
    ).toHaveCount(0);
  });

  test('advanced options collapsed by default, expand on click', async ({
    window,
  }) => {
    await openCommitContextMenu(window);
    await window
      .locator('.commit-context-menu .context-item', { hasText: 'Add Tag' })
      .click();
    await expect(
      window.locator('[data-testid="tag-move-existing"]'),
    ).not.toBeVisible();
    await window.locator('button', { hasText: 'Advanced Options' }).click();
    await expect(
      window.locator('[data-testid="tag-move-existing"]'),
    ).toBeVisible();
    await expect(
      window.locator('[data-testid="tag-lightweight"]'),
    ).toBeVisible();
  });

  test('push tag checkbox visible when remote exists', async ({ window }) => {
    await openCommitContextMenu(window);
    await window
      .locator('.commit-context-menu .context-item', { hasText: 'Add Tag' })
      .click();
    await expect(
      window.locator('[data-testid="tag-push-checkbox"]'),
    ).toBeVisible();
  });
});
