import simpleGit from 'simple-git';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TestRepo {
  repoPath: string;
  cleanup: () => void;
}

/**
 * Creates a temp git repo with known history for deterministic e2e tests.
 *
 * Structure:
 *   Initial commit          (main, tag: v0.1.0)
 *   feat: initial setup     (tag: v0.2.0)
 *   ├─ feat: add auth       (feature/auth)
 *   │  feat: add login page
 *   ├─ fix: update deps     (main)
 *   Merge feature/auth      (main, HEAD)
 *   chore: update config    (develop)
 *
 * 7 commits, 3 branches, 2 tags, 1 merge, 1 remote (origin → bare repo).
 */
export async function createTestRepo(): Promise<TestRepo> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitarbor-test-'));
  const bareDir = path.join(tmpDir, 'remote.git');
  const workDir = path.join(tmpDir, 'working');

  // Create bare "remote"
  fs.mkdirSync(bareDir, { recursive: true });
  await simpleGit(bareDir).init(true);

  // Clone it
  await simpleGit().clone(bareDir, workDir);

  const git = simpleGit(workDir);
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test User');
  await git.addConfig('init.defaultBranch', 'main');

  // Initial commit
  fs.writeFileSync(path.join(workDir, 'README.md'), '# Test Repo\n');
  await git.add('.');
  await git.commit('Initial commit');
  // Ensure branch is named 'main' regardless of system git config
  await git.branch(['-M', 'main']);
  await git.addTag('v0.1.0');

  // Second commit
  fs.writeFileSync(
    path.join(workDir, 'setup.ts'),
    'export const version = 1;\n',
  );
  await git.add('.');
  await git.commit('feat: initial setup');
  await git.addTag('v0.2.0');

  // Feature branch
  await git.checkoutLocalBranch('feature/auth');

  fs.writeFileSync(
    path.join(workDir, 'auth.ts'),
    'export function auth() {}\n',
  );
  await git.add('.');
  await git.commit('feat: add auth middleware');

  fs.writeFileSync(
    path.join(workDir, 'login.ts'),
    'export function login() {}\n',
  );
  await git.add('.');
  await git.commit('feat: add login page');

  // Back to main, make a commit
  await git.checkout('main');

  fs.writeFileSync(path.join(workDir, 'deps.ts'), 'export const deps = [];\n');
  await git.add('.');
  await git.commit('fix: update dependencies');

  // Merge feature/auth
  await git.merge([
    'feature/auth',
    '--no-ff',
    '-m',
    "Merge branch 'feature/auth' into main",
  ]);

  // Develop branch
  await git.checkoutLocalBranch('develop');

  fs.writeFileSync(
    path.join(workDir, 'config.ts'),
    'export const config = {};\n',
  );
  await git.add('.');
  await git.commit('chore: update config');

  // Back to main
  await git.checkout('main');

  // Unmerged branch for merge test
  await git.checkoutLocalBranch('feature/merge-test');
  fs.writeFileSync(
    path.join(workDir, 'merge-test.ts'),
    'export function mergeTest() {}\n',
  );
  await git.add('.');
  await git.commit('feat: merge test feature');
  await git.checkout('main');

  // Unmerged branch for rebase test
  await git.checkoutLocalBranch('feature/rebase-test');
  fs.writeFileSync(
    path.join(workDir, 'rebase-test.ts'),
    'export function rebaseTest() {}\n',
  );
  await git.add('.');
  await git.commit('feat: rebase test feature');
  await git.checkout('main');

  // Push everything to "remote"
  await git.push(['-u', 'origin', 'main']);
  await git.push('origin', 'feature/auth');
  await git.push('origin', 'develop');
  await git.push('origin', 'feature/merge-test');
  await git.push('origin', 'feature/rebase-test');
  await git.push('origin', '--tags');

  // Create a local commit to make main ahead of origin/main by 1
  fs.writeFileSync(
    path.join(workDir, 'local-only.ts'),
    'export const local = true;\n',
  );
  await git.add('.');
  await git.commit('feat: local only commit (ahead of origin)');

  // Create a stash for testing
  fs.writeFileSync(path.join(workDir, 'wip.ts'), 'export const wip = true;\n');
  await git.add('.');
  await git.raw(['stash', 'push', '-m', 'test stash: WIP changes']);

  // Leave uncommitted changes for working status / commit tests
  fs.writeFileSync(
    path.join(workDir, 'staged-file.ts'),
    'export const staged = true;\n',
  );
  await git.add('staged-file.ts'); // staged

  fs.writeFileSync(
    path.join(workDir, 'unstaged-file.ts'),
    'export const unstaged = true;\n',
  ); // unstaged (not added)

  // Untracked file in a subdirectory — exercises tree-view rendering and
  // path-vs-name sort distinctions.
  fs.mkdirSync(path.join(workDir, 'src', 'utils'), { recursive: true });
  fs.writeFileSync(
    path.join(workDir, 'src', 'utils', 'helper.ts'),
    'export const helper = true;\n',
  );

  return {
    repoPath: workDir,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

/**
 * Add a `feature/rebase-interactive-test` branch with a messy commit chain
 * tailored for interactive-rebase scenarios. Caller passes the existing
 * test repo path. Leaves the working tree on the test branch so callers can
 * exercise rebase actions; checkout back to main if they need a clean state.
 *
 * Branch (newest-first):
 *   add tests for rebase page
 *   tiny tweak to rebase                    ← fixup target
 *   fix: add rebase contact page            ← reword target
 *   add rebase page route                   ← reorder target
 *   WIP rebase debug                        ← drop target
 *   add rebase About page                   ← squash target
 *   add rebase home page
 */
export async function createRebaseInteractiveBranch(
  repoPath: string,
): Promise<{ baseHash: string }> {
  const git = simpleGit(repoPath);

  // Anchor on main so the branch sits cleanly off it.
  await git.checkout('main');
  // Reset working tree before branching to avoid carrying over the dirty
  // state from createTestRepo.
  await git.raw(['stash', 'push', '-u', '-m', 'pre-rebase-branch']);
  await git.checkoutLocalBranch('feature/rebase-interactive-test');

  // Capture the base (= last main commit) for the rebase entry point.
  const baseHash = (await git.raw(['rev-parse', 'HEAD'])).trim();

  fs.mkdirSync(path.join(repoPath, 'rebase-site'), { recursive: true });

  fs.writeFileSync(
    path.join(repoPath, 'rebase-site', 'home.txt'),
    'rebase home\n',
  );
  await git.add('.');
  await git.commit('add rebase home page');

  fs.writeFileSync(
    path.join(repoPath, 'rebase-site', 'about.txt'),
    'rebase about\n',
  );
  await git.add('.');
  await git.commit('add rebase About page');

  // WIP debug touches a SEPARATE file so dropping this commit doesn't change
  // the context for later commits that modify about.txt.
  fs.writeFileSync(
    path.join(repoPath, 'rebase-site', 'wip-debug.txt'),
    'temporary debug log, please ignore\n',
  );
  await git.add('.');
  await git.commit('WIP rebase debug');

  fs.mkdirSync(path.join(repoPath, 'rebase-site', 'router'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(repoPath, 'rebase-site', 'router', 'routes.txt'),
    '/about -> about\n',
  );
  await git.add('.');
  await git.commit('add rebase page route');

  fs.mkdirSync(path.join(repoPath, 'rebase-site', 'contact'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(repoPath, 'rebase-site', 'contact', 'contact.txt'),
    'rebase@example.com\n',
  );
  await git.add('.');
  await git.commit('fix: add rebase contact page');

  fs.appendFileSync(
    path.join(repoPath, 'rebase-site', 'about.txt'),
    'Last updated: 2026\n',
  );
  await git.add('.');
  await git.commit('tiny tweak to rebase');

  fs.mkdirSync(path.join(repoPath, 'rebase-site', 'tests'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(repoPath, 'rebase-site', 'tests', 'about.test.txt'),
    'test: rebase about renders\n',
  );
  await git.add('.');
  await git.commit('add tests for rebase page');

  return { baseHash };
}

/**
 * Set up a merge conflict scenario in an existing test repo.
 *
 * Creates branch `merge-conflict-test` that modifies `auth.ts` one way, then
 * commits an incompatible change to the same file on `main`. Merging
 * `merge-conflict-test` into `main` is then guaranteed to surface a conflict
 * in `auth.ts`. Branch name is flat (no slash) so it appears as a top-level
 * tree-item in the sidebar.
 *
 * Caller should clean the working tree first (`git reset --hard HEAD && git
 * clean -fd`) — the default fixture leaves dirty working state behind.
 */
export async function createMergeConflict(repoPath: string): Promise<void> {
  const git = simpleGit(repoPath);
  const authPath = path.join(repoPath, 'auth.ts');

  await git.checkout('main');
  await git.checkoutLocalBranch('merge-conflict-test');
  fs.writeFileSync(authPath, 'export function auth() { return "branch"; }\n');
  await git.add('.');
  await git.commit('feat: tweak auth from branch');

  await git.checkout('main');
  fs.writeFileSync(authPath, 'export function auth() { return "main"; }\n');
  await git.add('.');
  await git.commit('feat: tweak auth from main');
}
