import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import simpleGit, { type SimpleGit } from 'simple-git';
import type {
  Branch,
  Remote,
  Tag,
  Stash,
  Commit,
  ChangedFile,
  FileDiff,
  DiffHunk,
  DiffLine,
  WorkingStatus,
  FileStatus,
} from '../renderer/types';
import { relativeDate } from '../shared/date-utils';
import { parseBlamePorcelain, type BlameLine } from '../shared/blame-parser';

const COMMIT_FORMAT = {
  hash: '%H',
  abbrevHash: '%h',
  parents: '%P',
  message: '%s',
  authorName: '%an',
  authorEmail: '%ae',
  date: '%aI',
  refs: '%D',
};

export class GitService {
  constructor(private git: SimpleGit) {}

  async getBranches(): Promise<Branch[]> {
    const summary = await this.git.branch(['-v']);
    const status = await this.git.status();

    // Get ahead/behind for all branches
    const trackingInfo: Record<
      string,
      { ahead: number; behind: number; tracking: string }
    > = {};
    try {
      const raw = await this.git.raw([
        'for-each-ref',
        '--format=%(refname:short)\t%(upstream:short)\t%(upstream:track)',
        'refs/heads',
      ]);
      for (const line of raw.trim().split('\n')) {
        if (!line) continue;
        const [branch, upstream, track] = line.split('\t');
        if (!upstream) continue;
        let ahead = 0,
          behind = 0;
        const aheadMatch = track?.match(/ahead (\d+)/);
        const behindMatch = track?.match(/behind (\d+)/);
        if (aheadMatch) ahead = parseInt(aheadMatch[1]);
        if (behindMatch) behind = parseInt(behindMatch[1]);
        trackingInfo[branch] = { ahead, behind, tracking: upstream };
      }
    } catch {
      // Fallback to status for current branch only
    }

    return summary.all
      .filter((name) => !name.startsWith('remotes/'))
      .map((name) => {
        const info = summary.branches[name];
        const ti = trackingInfo[name];
        return {
          name,
          current: info.current,
          commit: info.commit,
          tracking:
            ti?.tracking ?? (info.current ? (status.tracking ?? null) : null),
          ahead: ti?.ahead ?? (info.current ? status.ahead : 0),
          behind: ti?.behind ?? (info.current ? status.behind : 0),
        };
      });
  }

  async getRemotes(): Promise<Remote[]> {
    const remotes = await this.git.getRemotes(true);
    const branchSummary = await this.git.branch(['-r']);

    return remotes.map((remote) => ({
      name: remote.name,
      branches: branchSummary.all
        .filter((b) => b.startsWith(`${remote.name}/`))
        .map((b) => b.replace(`${remote.name}/`, '')),
      url: remote.refs?.push || remote.refs?.fetch || undefined,
    }));
  }

  async getTags(): Promise<Tag[]> {
    const result = await this.git.tags();
    return result.all.map((name) => ({ name }));
  }

  async getStashes(): Promise<Stash[]> {
    const result = await this.git.stashList();
    return result.all.map((entry, index) => ({
      index,
      message: entry.message,
      date: entry.date,
    }));
  }

  async getCommits({
    maxCount = 100,
    skip = 0,
    all = false,
    logOrder = 'topo',
  }: {
    maxCount?: number;
    skip?: number;
    all?: boolean;
    logOrder?: 'date' | 'topo';
  } = {}): Promise<Commit[]> {
    // Build format string with NUL separators between fields, newline between records
    const keys = Object.keys(COMMIT_FORMAT) as (keyof typeof COMMIT_FORMAT)[];
    const formatStr = keys.map((k) => COMMIT_FORMAT[k]).join('%x00');

    const args = ['log', `--max-count=${maxCount}`, `--format=${formatStr}`];
    args.push(logOrder === 'topo' ? '--topo-order' : '--date-order');
    if (all) args.push('--branches', '--remotes', '--tags');
    if (skip > 0) args.push(`--skip=${skip}`);

    const raw = await this.git.raw(args);
    if (!raw.trim()) return [];

    return raw
      .trim()
      .split('\n')
      .map((line) => {
        const parts = line.split('\x00');
        const record: Record<string, string> = {};
        keys.forEach((key, i) => {
          record[key] = parts[i] ?? '';
        });

        return {
          hash: record.hash,
          hashShort: record.abbrevHash,
          message: record.message,
          authorName: record.authorName,
          authorEmail: record.authorEmail,
          date: record.date,
          dateRelative: relativeDate(record.date),
          parents: record.parents
            ? record.parents.split(' ').filter(Boolean)
            : [],
          refs: record.refs ? record.refs.split(', ').filter(Boolean) : [],
        };
      });
  }

  /**
   * Filtered log search across all branches/remotes/tags. Mode picks the
   * underlying git filter:
   *
   * - message: `--grep=<query>` (case-insensitive)
   * - author:  `--author=<query>`
   * - sha:     forwards `<query>` as a revision range (matches commits whose
   *            hash starts with the given prefix). Returns [] if invalid.
   * - file-content: `-S<query>` (pickaxe — commits adding/removing the term)
   *
   * `since` / `until` are ISO date strings, optional. Limits to 500 results
   * to keep UI snappy on huge repos.
   */
  async searchCommits(opts: {
    query: string;
    mode: 'message' | 'author' | 'sha' | 'file-content';
    since?: string;
    until?: string;
  }): Promise<Commit[]> {
    const { query, mode, since, until } = opts;
    if (!query.trim()) return [];

    const keys = Object.keys(COMMIT_FORMAT) as (keyof typeof COMMIT_FORMAT)[];
    const formatStr = keys.map((k) => COMMIT_FORMAT[k]).join('%x00');

    const args = ['log', '--max-count=500', `--format=${formatStr}`];
    if (since) args.push(`--since=${since}`);
    if (until) args.push(`--until=${until}`);

    if (mode === 'sha') {
      // sha mode: match commits whose hash starts with the query.
      // Bail early on obviously invalid input — git would error out anyway.
      if (!/^[0-9a-fA-F]+$/.test(query.trim())) return [];
      args.push('--all', '--no-walk', query.trim());
    } else {
      args.push('--all');
      if (mode === 'message') args.push('-i', `--grep=${query}`);
      else if (mode === 'author') args.push(`--author=${query}`);
      else if (mode === 'file-content') args.push(`-S${query}`);
    }

    let raw: string;
    try {
      raw = await this.git.raw(args);
    } catch {
      return [];
    }
    if (!raw.trim()) return [];

    return raw
      .trim()
      .split('\n')
      .map((line) => {
        const parts = line.split('\x00');
        const record: Record<string, string> = {};
        keys.forEach((key, i) => {
          record[key] = parts[i] ?? '';
        });
        return {
          hash: record.hash,
          hashShort: record.abbrevHash,
          message: record.message,
          authorName: record.authorName,
          authorEmail: record.authorEmail,
          date: record.date,
          dateRelative: relativeDate(record.date),
          parents: record.parents
            ? record.parents.split(' ').filter(Boolean)
            : [],
          refs: record.refs ? record.refs.split(', ').filter(Boolean) : [],
        };
      });
  }

  async getCommitBody(hash: string): Promise<string> {
    const raw = await this.git.raw(['log', '-1', '--format=%b', hash]);
    return raw.trim();
  }

  /**
   * `git log [--follow] -- <path>` — commits that touched a single file.
   * Used by the File Log dialog. Reuses the same record format as
   * `getCommits` so the renderer can treat results identically.
   *
   * `followRenames=true` adds `--follow` so history continues through
   * a single rename (git's blame-rename heuristic; can't follow more
   * than one per call).
   */
  async getFileHistory(opts: {
    path: string;
    followRenames?: boolean;
    ref?: string;
  }): Promise<Commit[]> {
    const keys = Object.keys(COMMIT_FORMAT) as (keyof typeof COMMIT_FORMAT)[];
    const formatStr = keys.map((k) => COMMIT_FORMAT[k]).join('%x00');

    const args = ['log', `--format=${formatStr}`];
    if (opts.followRenames) args.push('--follow');
    if (opts.ref) args.push(opts.ref);
    args.push('--', opts.path);

    let raw: string;
    try {
      raw = await this.git.raw(args);
    } catch {
      return [];
    }
    if (!raw.trim()) return [];

    return raw
      .trim()
      .split('\n')
      .map((line) => {
        const parts = line.split('\x00');
        const record: Record<string, string> = {};
        keys.forEach((key, i) => {
          record[key] = parts[i] ?? '';
        });
        return {
          hash: record.hash,
          hashShort: record.abbrevHash,
          message: record.message,
          authorName: record.authorName,
          authorEmail: record.authorEmail,
          date: record.date,
          dateRelative: relativeDate(record.date),
          parents: record.parents
            ? record.parents.split(' ').filter(Boolean)
            : [],
          refs: record.refs ? record.refs.split(', ').filter(Boolean) : [],
        };
      });
  }

  /**
   * `git blame --porcelain [<ref>] -- <path>` — per-line authorship.
   * Output parsed by the shared porcelain parser. Returns `[]` rather
   * than throwing on errors so the renderer can show an empty state.
   */
  async getBlame(opts: { path: string; ref?: string }): Promise<BlameLine[]> {
    const args = ['blame', '--porcelain'];
    if (opts.ref) args.push(opts.ref);
    args.push('--', opts.path);
    try {
      const raw = await this.git.raw(args);
      return parseBlamePorcelain(raw);
    } catch {
      return [];
    }
  }

  /**
   * `git show <ref>:<path>` — read a file's contents at a specific
   * commit. Used by the Annotate view to source the line text.
   */
  async getFileAtCommit(opts: { path: string; ref: string }): Promise<string> {
    try {
      return await this.git.raw(['show', `${opts.ref}:${opts.path}`]);
    } catch {
      return '';
    }
  }

  async getCommitFiles(hash: string): Promise<ChangedFile[]> {
    // diff-tree --no-commit-id -r --name-status: shows changed files with status
    // --root handles root commit (no parent)
    // -m --first-parent makes merge commits list files too, diffed against the
    // first parent (matches what `getFileDiff` does via `hash^` = `hash^1`).
    const raw = await this.git.raw([
      'diff-tree',
      '--no-commit-id',
      '-r',
      '--name-status',
      '-m',
      '--first-parent',
      '--root',
      hash,
    ]);
    if (!raw.trim()) return [];

    const statusMap: Record<string, ChangedFile['status']> = {
      A: 'A',
      M: 'M',
      D: 'D',
      R: 'R',
      C: 'C',
      U: 'U',
    };

    return raw
      .trim()
      .split('\n')
      .map((line) => {
        const [status, ...pathParts] = line.split('\t');
        const statusChar = status.charAt(0); // R100 → R
        return {
          path: pathParts[pathParts.length - 1] ?? pathParts[0],
          status: statusMap[statusChar] ?? 'M',
          from: statusChar === 'R' ? pathParts[0] : undefined,
        };
      });
  }

  async getFileDiff(hash: string, filePath: string): Promise<FileDiff> {
    let raw: string;
    try {
      raw = await this.git.raw(['diff', `${hash}^`, hash, '--', filePath]);
    } catch {
      // Root commit — no parent
      raw = await this.git.raw(['diff', '--root', hash, '--', filePath]);
    }

    // Determine status from the commit's file list
    const files = await this.getCommitFiles(hash);
    const fileInfo = files.find((f) => f.path === filePath);
    const status = fileInfo?.status ?? 'M';

    if (!raw.trim()) {
      return { path: filePath, status, binary: false, hunks: [] };
    }
    if (raw.includes('Binary files')) {
      return { path: filePath, status, binary: true, hunks: [] };
    }
    return this.parseUnifiedDiff(raw, filePath, status);
  }

  async getWorkingStatus(): Promise<WorkingStatus> {
    const status = await this.git.status();
    const staged: ChangedFile[] = [];
    const unstaged: ChangedFile[] = [];

    for (const file of status.files) {
      const indexStatus = file.index;
      const wdStatus = file.working_dir;

      if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
        staged.push({
          path: file.path,
          status: indexStatus as FileStatus,
          from: file.from,
        });
      }
      if (wdStatus && wdStatus !== ' ') {
        unstaged.push({
          path: file.path,
          status: (wdStatus === '?' ? '?' : wdStatus) as FileStatus,
          from: file.from,
        });
      }
    }

    // Add conflicted files as unstaged with status U
    for (const conflictPath of status.conflicted) {
      if (!unstaged.some((f) => f.path === conflictPath)) {
        unstaged.push({ path: conflictPath, status: 'U' });
      }
    }

    return {
      staged,
      unstaged,
      hasChanges: staged.length + unstaged.length > 0,
    };
  }

  async getWorkingDiff(filePath: string, isStaged: boolean): Promise<FileDiff> {
    const args = isStaged
      ? ['diff', '--cached', '--', filePath]
      : ['diff', '--', filePath];

    const raw = await this.git.raw(args);

    // `git diff` doesn't see untracked files — synthesize a full-addition diff
    if (!isStaged && !raw.trim()) {
      const untracked = await this.buildUntrackedDiff(filePath);
      if (untracked) return untracked;
    }

    const status: FileStatus = 'M';

    if (!raw.trim()) {
      return { path: filePath, status, binary: false, hunks: [] };
    }

    if (raw.includes('Binary files')) {
      return { path: filePath, status, binary: true, hunks: [] };
    }

    // Reuse unified diff parser
    return this.parseUnifiedDiff(raw, filePath, status);
  }

  private async buildUntrackedDiff(filePath: string): Promise<FileDiff | null> {
    try {
      await this.git.raw(['ls-files', '--error-unmatch', '--', filePath]);
      return null;
    } catch {
      // file is untracked — fall through and synthesize
    }

    const root = await this.getRepoRoot();
    const absPath = path.join(root, filePath);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return null;

    const buf = fs.readFileSync(absPath);
    const sampleLen = Math.min(buf.length, 8000);
    for (let i = 0; i < sampleLen; i++) {
      if (buf[i] === 0) {
        return { path: filePath, status: 'A', binary: true, hunks: [] };
      }
    }

    const content = buf.toString('utf8');
    if (content.length === 0) {
      return { path: filePath, status: 'A', binary: false, hunks: [] };
    }

    const hasTrailingNewline = content.endsWith('\n');
    const rawLines = content.split('\n');
    const contentLines = hasTrailingNewline ? rawLines.slice(0, -1) : rawLines;

    const lines: DiffLine[] = contentLines.map((line, idx) => ({
      oldLine: null,
      newLine: idx + 1,
      type: 'added',
      content: line,
    }));

    return {
      path: filePath,
      status: 'A',
      binary: false,
      hunks: [
        {
          header: `@@ -0,0 +1,${contentLines.length} @@`,
          lines,
        },
      ],
    };
  }

  private parseUnifiedDiff(
    raw: string,
    filePath: string,
    status: FileStatus,
  ): FileDiff {
    const hunks: DiffHunk[] = [];
    const lines = raw.split('\n');
    let currentHunk: DiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
      const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
        oldLine = parseInt(hunkMatch[1]);
        newLine = parseInt(hunkMatch[2]);
        continue;
      }

      if (!currentHunk) continue;

      let diffLine: DiffLine;
      if (line.startsWith('+')) {
        diffLine = {
          oldLine: null,
          newLine: newLine++,
          type: 'added',
          content: line.slice(1),
        };
      } else if (line.startsWith('-')) {
        diffLine = {
          oldLine: oldLine++,
          newLine: null,
          type: 'removed',
          content: line.slice(1),
        };
      } else if (line.startsWith('\\')) {
        continue;
      } else {
        diffLine = {
          oldLine: oldLine++,
          newLine: newLine++,
          type: 'context',
          content: line.startsWith(' ') ? line.slice(1) : line,
        };
      }
      currentHunk.lines.push(diffLine);
    }

    return { path: filePath, status, binary: false, hunks };
  }

  async stageFile(filePath: string): Promise<void> {
    await this.git.add(filePath);
  }

  async unstageFile(filePath: string): Promise<void> {
    await this.git.raw(['reset', 'HEAD', '--', filePath]);
  }

  async stageAll(): Promise<void> {
    await this.git.add('.');
  }

  async unstageAll(): Promise<void> {
    await this.git.raw(['reset', 'HEAD']);
  }

  async getConfig(key: string): Promise<string> {
    const value = await this.git.getConfig(key);
    return value.value ?? '';
  }

  async commit(
    message: string,
    opts: {
      amend?: boolean;
      noVerify?: boolean;
      stageAll?: boolean;
      exclude?: string[];
      author?: { name: string; email: string };
    } = {},
  ): Promise<void> {
    const { amend, noVerify, stageAll, exclude, author } = opts;

    if (stageAll) {
      // Stage every change (including untracked + deletions), then unstage
      // any explicitly-excluded paths so they don't enter the commit.
      await this.git.raw(['add', '-A']);
      if (exclude && exclude.length > 0) {
        await this.git.raw(['reset', 'HEAD', '--', ...exclude]);
      }
    }

    const args: string[] = [];
    if (author && author.name && author.email) {
      args.push(
        '-c',
        `user.name=${author.name}`,
        '-c',
        `user.email=${author.email}`,
      );
    }
    args.push('commit', '-m', message);
    if (amend) args.push('--amend');
    if (noVerify) args.push('--no-verify');
    await this.git.raw(args);
  }

  async pull(): Promise<void> {
    await this.git.pull();
  }

  async push(): Promise<void> {
    const status = await this.git.status();
    if (status.tracking) {
      await this.git.push();
    } else {
      // No upstream — push with -u to set tracking
      const branch = status.current ?? 'HEAD';
      await this.git.push(['-u', 'origin', branch]);
    }
  }

  async pushBranches(
    remote: string,
    branches: Array<{ local: string; remote?: string; setUpstream?: boolean }>,
    includeTags = false,
  ): Promise<void> {
    if (branches.length === 0 && !includeTags) return;
    const args = ['push'];
    if (branches.some((b) => b.setUpstream)) args.push('-u');
    args.push(remote);
    for (const b of branches) {
      const refspec =
        b.remote && b.remote !== b.local ? `${b.local}:${b.remote}` : b.local;
      args.push(refspec);
    }
    if (includeTags) args.push('--tags');
    await this.git.raw(args);
  }

  async fetch(): Promise<void> {
    await this.git.fetch(['--all']);
  }

  async applyStash(
    index: number,
    drop: boolean,
  ): Promise<{ conflicts: string[] }> {
    const ref = `stash@{${index}}`;
    try {
      if (drop) {
        await this.git.raw(['stash', 'pop', ref]);
      } else {
        await this.git.raw(['stash', 'apply', ref]);
      }
      return { conflicts: [] };
    } catch {
      // Check if stash was partially applied with conflicts
      const status = await this.git.status();
      if (status.conflicted.length > 0) {
        return { conflicts: status.conflicted };
      }
      throw new Error('Stash apply failed');
    }
  }

  async stash(message?: string, keepIndex?: boolean): Promise<void> {
    const args = ['stash', 'push'];
    if (message) args.push('-m', message);
    if (keepIndex) args.push('--keep-index');
    await this.git.raw(args);
  }

  async merge(
    branch: string,
  ): Promise<{ conflicts: string[]; summary: string; error?: string }> {
    try {
      const result = await this.git.merge([branch]);
      const summary = result.result ?? 'Merge completed';
      return { conflicts: [], summary };
    } catch (e) {
      try {
        const status = await this.git.status();
        if (status.conflicted.length > 0) {
          return { conflicts: status.conflicted, summary: 'Merge conflicts' };
        }
      } catch (statusErr) {
        console.error('[git-service] status after merge error:', statusErr);
      }
      const msg = e instanceof Error ? e.message : String(e);
      return {
        conflicts: [],
        summary: '',
        error: `Merge ${branch} failed: ${msg}`,
      };
    }
  }

  async rebase(
    branch: string,
  ): Promise<{ conflicts: string[]; summary: string; error?: string }> {
    try {
      const output = await this.git.raw(['rebase', branch]);
      const summary = output.trim() || 'Rebase completed';
      return { conflicts: [], summary };
    } catch (e) {
      const status = await this.git.status();
      if (status.conflicted.length > 0) {
        return { conflicts: status.conflicted, summary: 'Rebase conflicts' };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return {
        conflicts: [],
        summary: '',
        error: `Rebase onto ${branch} failed: ${msg}`,
      };
    }
  }

  async checkout(target: string): Promise<void> {
    await this.git.checkout(target);
  }

  async resetToCommit(
    hash: string,
    mode: 'soft' | 'mixed' | 'hard',
  ): Promise<void> {
    await this.git.raw(['reset', `--${mode}`, hash]);
  }

  async revertCommit(
    hash: string,
  ): Promise<{ conflicts: string[]; summary: string; error?: string }> {
    try {
      await this.git.raw(['revert', '--no-edit', hash]);
      return { conflicts: [], summary: 'Revert completed' };
    } catch (e) {
      const status = await this.git.status();
      if (status.conflicted.length > 0) {
        return { conflicts: status.conflicted, summary: 'Revert conflicts' };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return {
        conflicts: [],
        summary: '',
        error: `Revert ${hash} failed: ${msg}`,
      };
    }
  }

  async cherryPick(
    hash: string,
  ): Promise<{ conflicts: string[]; summary: string; error?: string }> {
    try {
      await this.git.raw(['cherry-pick', hash]);
      return { conflicts: [], summary: 'Cherry-pick completed' };
    } catch (e) {
      const status = await this.git.status();
      if (status.conflicted.length > 0) {
        return {
          conflicts: status.conflicted,
          summary: 'Cherry-pick conflicts',
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return {
        conflicts: [],
        summary: '',
        error: `Cherry-pick ${hash} failed: ${msg}`,
      };
    }
  }

  /**
   * Resolve `.git/` directory (or worktree git-dir). Path is relative to cwd
   * for linked worktrees; we anchor it to repo root via getRepoRoot to get an
   * absolute path safe for fs operations.
   */
  private async getGitDir(): Promise<string> {
    const raw = (await this.git.revparse(['--git-dir'])).trim();
    if (path.isAbsolute(raw)) return raw;
    const root = await this.getRepoRoot();
    return path.join(root, raw);
  }

  async getOperationInProgress(): Promise<{
    kind: 'merge' | 'rebase' | 'cherry-pick' | 'revert';
  } | null> {
    const gitDir = await this.getGitDir();
    if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD')))
      return { kind: 'merge' };
    if (
      fs.existsSync(path.join(gitDir, 'rebase-apply')) ||
      fs.existsSync(path.join(gitDir, 'rebase-merge'))
    ) {
      return { kind: 'rebase' };
    }
    if (fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD'))) {
      return { kind: 'cherry-pick' };
    }
    if (fs.existsSync(path.join(gitDir, 'REVERT_HEAD'))) {
      return { kind: 'revert' };
    }
    return null;
  }

  /**
   * Resolve a conflicted file using one of two strategies, then stage it.
   *
   * Semantics from the user's perspective ("Mine" = my branch's version,
   * "Theirs" = the incoming version) require flag remapping during rebase
   * because rebase replays the user's commits onto the upstream — so
   * `--ours` is actually the upstream and `--theirs` is the user's commit.
   */
  async resolveConflict(
    filePath: string,
    strategy: 'mine' | 'theirs',
  ): Promise<{ error?: string }> {
    try {
      const op = await this.getOperationInProgress();
      const inverted = op?.kind === 'rebase';
      const flag = (strategy === 'mine') === !inverted ? '--ours' : '--theirs';
      await this.git.raw(['checkout', flag, '--', filePath]);
      await this.git.raw(['add', '--', filePath]);
      return {};
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `Resolve ${filePath} failed: ${msg}` };
    }
  }

  async markResolved(filePath: string): Promise<{ error?: string }> {
    try {
      await this.git.raw(['add', '--', filePath]);
      return {};
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `Mark resolved failed: ${msg}` };
    }
  }

  /**
   * Restore conflict markers in working copy by checking out from the merge
   * stage. Only meaningful while an operation is in progress.
   */
  async markUnresolved(filePath: string): Promise<{ error?: string }> {
    try {
      await this.git.raw(['checkout', '--merge', '--', filePath]);
      return {};
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `Mark unresolved failed: ${msg}` };
    }
  }

  async abortOperation(onCleanup?: () => void): Promise<{ error?: string }> {
    const op = await this.getOperationInProgress();
    if (!op) return { error: 'No operation in progress' };
    const subcommand =
      op.kind === 'merge'
        ? 'merge'
        : op.kind === 'rebase'
          ? 'rebase'
          : op.kind === 'cherry-pick'
            ? 'cherry-pick'
            : 'revert';
    try {
      await this.git.raw([subcommand, '--abort']);
      onCleanup?.();
      return {};
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `${subcommand} --abort failed: ${msg}` };
    }
  }

  /**
   * Finalise the in-progress operation once all conflicts have been resolved.
   *
   * - merge: `git commit --no-edit` (uses prefilled .git/MERGE_MSG)
   * - rebase / cherry-pick / revert: `<op> --continue` with GIT_EDITOR=":"
   *   so git doesn't block waiting for an editor on the commit message.
   *
   * Refuses to run if any conflicts are still unresolved — caller surfaces
   * the error string.
   */
  async continueOperation(
    envOverrides?: Record<string, string>,
  ): Promise<{ error?: string }> {
    const op = await this.getOperationInProgress();
    if (!op) return { error: 'No operation in progress' };

    const status = await this.git.status();
    if (status.conflicted.length > 0) {
      return {
        error: `${status.conflicted.length} unresolved conflict(s) remain`,
      };
    }

    try {
      if (op.kind === 'merge') {
        await this.git.raw(['commit', '--no-edit']);
      } else {
        const subcommand =
          op.kind === 'rebase'
            ? 'rebase'
            : op.kind === 'cherry-pick'
              ? 'cherry-pick'
              : 'revert';
        // Default to no-op editors so git doesn't block on a prompt. When an
        // interactive rebase is in progress the caller passes our editor
        // script in envOverrides so reword/squash messages still flow.
        let g = this.git.env('GIT_EDITOR', ':').env('GIT_SEQUENCE_EDITOR', ':');
        if (envOverrides) {
          for (const [k, v] of Object.entries(envOverrides)) {
            g = g.env(k, v);
          }
        }
        await g.raw([subcommand, '--continue']);
      }
      return {};
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `Continue ${op.kind} failed: ${msg}` };
    }
  }

  async archiveCommit(
    hash: string,
    filePath: string,
    format: 'zip' | 'tar',
  ): Promise<void> {
    await this.git.raw(['archive', `--format=${format}`, '-o', filePath, hash]);
  }

  async createPatchFromCommit(hash: string): Promise<string> {
    return await this.git.raw(['format-patch', '-1', hash, '--stdout']);
  }

  async pushRevision(
    remote: string,
    hash: string,
    branch: string,
    force?: boolean,
  ): Promise<void> {
    const args = ['push'];
    if (force) args.push('--force-with-lease');
    args.push(remote, `${hash}:refs/heads/${branch}`);
    await this.git.raw(args);
  }

  async createBranch(name: string, startPoint?: string): Promise<void> {
    const args = ['branch', name];
    if (startPoint) args.push(startPoint);
    await this.git.raw(args);
  }

  /**
   * Delete a local branch. Soft (`-d`) refuses if the branch isn't merged into
   * upstream/HEAD; force (`-D`) deletes regardless. Errors surface as `error`
   * field instead of throwing so the renderer can show them in a toast.
   */
  async deleteBranch(
    name: string,
    force: boolean,
  ): Promise<{ error?: string }> {
    try {
      await this.git.raw(['branch', force ? '-D' : '-d', name]);
      return {};
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `Delete branch ${name} failed: ${msg}` };
    }
  }

  async createTag(
    name: string,
    commit: string,
    opts?: { message?: string; force?: boolean },
  ): Promise<void> {
    const args = ['tag'];
    if (opts?.message !== undefined) args.push('-a');
    if (opts?.force) args.push('-f');
    args.push(name);
    if (opts?.message !== undefined) args.push('-m', opts.message);
    args.push(commit);
    await this.git.raw(args);
  }

  async deleteTag(name: string): Promise<void> {
    await this.git.raw(['tag', '-d', name]);
  }

  async pushTag(name: string, remote: string): Promise<void> {
    await this.git.raw(['push', remote, `refs/tags/${name}`]);
  }

  async deleteRemoteTag(name: string, remote: string): Promise<void> {
    await this.git.raw(['push', remote, '--delete', `refs/tags/${name}`]);
  }

  async getRepoRoot(): Promise<string> {
    return (await this.git.revparse(['--show-toplevel'])).trim();
  }

  async discardFile(filePath: string, isUntracked: boolean): Promise<void> {
    const root = await this.getRepoRoot();
    if (isUntracked) {
      fs.rmSync(path.join(root, filePath), { force: true });
    } else {
      await this.git.checkout(['--', filePath]);
    }
  }

  async ignoreFile(filePath: string): Promise<void> {
    const root = await this.getRepoRoot();
    const gitignorePath = path.join(root, '.gitignore');
    const existing = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, 'utf-8')
      : '';
    const separator = existing.endsWith('\n') || existing === '' ? '' : '\n';
    fs.appendFileSync(gitignorePath, `${separator}${filePath}\n`);
  }

  async createPatch(filePath: string, staged: boolean): Promise<string> {
    const args = staged
      ? ['diff', '--cached', '--', filePath]
      : ['diff', '--', filePath];
    return await this.git.raw(args);
  }

  private applyPatchRaw(patch: string, applyArgs: string[]): Promise<void> {
    const tmpFile = path.join(os.tmpdir(), `gitarbor-patch-${Date.now()}.diff`);
    return (async () => {
      try {
        fs.writeFileSync(tmpFile, patch, 'utf-8');
        await this.git.raw(['apply', ...applyArgs, tmpFile]);
      } finally {
        try {
          fs.rmSync(tmpFile, { force: true });
        } catch {
          // ignore cleanup errors
        }
      }
    })();
  }

  /** Extract --- and +++ header lines from raw diff */
  private extractDiffHeader(raw: string): string {
    let header = '';
    for (const line of raw.split('\n')) {
      if (line.startsWith('--- ')) header += line + '\n';
      else if (line.startsWith('+++ ')) {
        header += line + '\n';
        break;
      }
    }
    return header;
  }

  /** Split raw diff into individual raw hunk strings (each starts with @@) */
  private splitRawHunks(raw: string): string[] {
    const lines = raw.split('\n');
    const hunks: string[] = [];
    let current: string[] = [];

    for (const line of lines) {
      if (line.startsWith('@@')) {
        if (current.length > 0) hunks.push(current.join('\n'));
        current = [line];
      } else if (current.length > 0) {
        current.push(line);
      }
    }
    if (current.length > 0) hunks.push(current.join('\n'));

    // Trim trailing empty lines from each hunk
    return hunks.map((h) => {
      const lines = h.split('\n');
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      return lines.join('\n');
    });
  }

  /**
   * Filter a raw hunk to include only selected lines.
   * lineIndices are 0-based indices into the hunk's content lines (excluding @@ header).
   */
  private filterRawHunk(
    rawHunk: string,
    lineIndices: number[],
    reverse: boolean,
  ): string {
    const lines = rawHunk.split('\n');
    const header = lines[0]; // @@ line
    const contentLines = lines.slice(1);
    const selected = new Set(lineIndices);
    const result: string[] = [];

    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i];
      const ch = line[0];
      const isSelected = selected.has(i);

      if (ch === ' ' || ch === undefined) {
        // Context line — always keep
        result.push(line);
      } else if (ch === '+') {
        if (isSelected) {
          result.push(line);
        } else if (reverse) {
          // Reverse: unselected + exists in target → context
          result.push(' ' + line.slice(1));
        }
        // Forward: unselected + → omit
      } else if (ch === '-') {
        if (isSelected) {
          result.push(line);
        } else if (!reverse) {
          // Forward: unselected - exists in target → context
          result.push(' ' + line.slice(1));
        }
        // Reverse: unselected - → omit
      } else if (line.startsWith('\\')) {
        // "\ No newline at end of file" — keep
        result.push(line);
      }
    }

    // Recalculate counts
    let oldCount = 0;
    let newCount = 0;
    for (const l of result) {
      const ch = l[0];
      if (ch === ' ') {
        oldCount++;
        newCount++;
      } else if (ch === '-') {
        oldCount++;
      } else if (ch === '+') {
        newCount++;
      }
    }

    // Parse original start positions
    const match = header.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    const oldStart = match ? match[1] : '1';
    const newStart = match ? match[2] : '1';
    const suffix = header.replace(/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/, '');

    const newHeader = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${suffix}`;
    return newHeader + '\n' + result.join('\n') + '\n';
  }

  async stageHunk(filePath: string, hunkIndex: number): Promise<void> {
    const raw = await this.git.raw(['diff', '--', filePath]);
    if (!raw.trim()) return;
    const header = this.extractDiffHeader(raw);
    const hunks = this.splitRawHunks(raw);
    if (hunkIndex >= hunks.length) return;
    const patch = header + hunks[hunkIndex] + '\n';
    await this.applyPatchRaw(patch, ['--cached']);
  }

  async unstageHunk(filePath: string, hunkIndex: number): Promise<void> {
    const raw = await this.git.raw(['diff', '--cached', '--', filePath]);
    if (!raw.trim()) return;
    const header = this.extractDiffHeader(raw);
    const hunks = this.splitRawHunks(raw);
    if (hunkIndex >= hunks.length) return;
    const patch = header + hunks[hunkIndex] + '\n';
    await this.applyPatchRaw(patch, ['--cached', '-R']);
  }

  async stageLines(
    filePath: string,
    hunkIndex: number,
    lineIndices: number[],
  ): Promise<void> {
    const raw = await this.git.raw(['diff', '--', filePath]);
    if (!raw.trim()) return;
    const header = this.extractDiffHeader(raw);
    const hunks = this.splitRawHunks(raw);
    if (hunkIndex >= hunks.length) return;
    const filtered = this.filterRawHunk(hunks[hunkIndex], lineIndices, false);
    await this.applyPatchRaw(header + filtered, ['--cached']);
  }

  async unstageLines(
    filePath: string,
    hunkIndex: number,
    lineIndices: number[],
  ): Promise<void> {
    const raw = await this.git.raw(['diff', '--cached', '--', filePath]);
    if (!raw.trim()) return;
    const header = this.extractDiffHeader(raw);
    const hunks = this.splitRawHunks(raw);
    if (hunkIndex >= hunks.length) return;
    const filtered = this.filterRawHunk(hunks[hunkIndex], lineIndices, true);
    await this.applyPatchRaw(header + filtered, ['--cached', '-R']);
  }

  async discardLines(
    filePath: string,
    hunkIndex: number,
    lineIndices: number[],
  ): Promise<void> {
    const raw = await this.git.raw(['diff', '--', filePath]);
    if (!raw.trim()) return;
    const header = this.extractDiffHeader(raw);
    const hunks = this.splitRawHunks(raw);
    if (hunkIndex >= hunks.length) return;
    const filtered = this.filterRawHunk(hunks[hunkIndex], lineIndices, true);
    await this.applyPatchRaw(header + filtered, ['-R']);
  }
}

/** Clone a remote repository into destPath. */
export async function cloneRepository(
  url: string,
  destPath: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await simpleGit().clone(url, destPath);
}

/** Initialise a new empty repository at destPath. */
export async function initRepository(destPath: string): Promise<void> {
  fs.mkdirSync(destPath, { recursive: true });
  await simpleGit(destPath).init();
}

/** Check whether a directory is a git working copy (has .git dir or file). */
export function isGitRepository(dirPath: string): boolean {
  const gitEntry = path.join(dirPath, '.git');
  return fs.existsSync(gitEntry);
}
