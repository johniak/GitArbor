import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GitService } from './git-service';
import type { SimpleGit, BranchSummary, StatusResult } from 'simple-git';

function createMockGit(overrides: Partial<SimpleGit> = {}): SimpleGit {
  return {
    branch: vi.fn(),
    status: vi.fn(),
    getRemotes: vi.fn(),
    ...overrides,
  } as unknown as SimpleGit;
}

describe('GitService', () => {
  describe('getBranches', () => {
    it('returns only local branches, excludes remotes', async () => {
      const mockGit = createMockGit({
        branch: vi.fn().mockResolvedValue({
          all: ['main', 'develop', 'remotes/origin/main'],
          current: 'main',
          detached: false,
          branches: {
            main: {
              current: true,
              name: 'main',
              commit: 'abc1234',
              label: 'main',
              linkedWorkTree: false,
            },
            develop: {
              current: false,
              name: 'develop',
              commit: 'def5678',
              label: 'develop',
              linkedWorkTree: false,
            },
            'remotes/origin/main': {
              current: false,
              name: 'remotes/origin/main',
              commit: 'abc1234',
              label: 'remotes/origin/main',
              linkedWorkTree: false,
            },
          },
        } as BranchSummary),
        status: vi.fn().mockResolvedValue({
          current: 'main',
          tracking: 'origin/main',
          ahead: 2,
          behind: 1,
        } as Partial<StatusResult>),
      });

      const service = new GitService(mockGit);
      const branches = await service.getBranches();

      // Only local branches — no remotes
      expect(branches).toHaveLength(2);

      expect(branches[0]).toMatchObject({
        name: 'main',
        current: true,
        commit: 'abc1234',
        tracking: 'origin/main',
        ahead: 2,
        behind: 1,
      });

      expect(branches[1]).toMatchObject({
        name: 'develop',
        current: false,
        tracking: null,
        ahead: 0,
        behind: 0,
      });
    });
  });

  describe('getRemotes', () => {
    let service: GitService;

    beforeEach(() => {
      const mockGit = createMockGit({
        getRemotes: vi.fn().mockResolvedValue([
          {
            name: 'origin',
            refs: {
              fetch: 'git@github.com:user/repo.git',
              push: 'git@github.com:user/repo.git',
            },
          },
        ]),
        branch: vi.fn().mockResolvedValue({
          all: ['origin/main', 'origin/develop'],
          current: 'main',
          detached: false,
          branches: {},
        } as BranchSummary),
      });
      service = new GitService(mockGit);
    });

    it('maps remotes with their branches', async () => {
      const remotes = await service.getRemotes();

      expect(remotes).toHaveLength(1);
      expect(remotes[0]).toMatchObject({
        name: 'origin',
        branches: ['main', 'develop'],
      });
    });

    it('exposes the push URL for the remote', async () => {
      const remotes = await service.getRemotes();
      expect(remotes[0].url).toBe('git@github.com:user/repo.git');
    });

    it('falls back to fetch URL when push URL missing', async () => {
      const mockGit = createMockGit({
        getRemotes: vi.fn().mockResolvedValue([
          {
            name: 'origin',
            refs: { fetch: 'git@github.com:user/repo.git', push: '' },
          },
        ]),
        branch: vi.fn().mockResolvedValue({
          all: [],
          current: 'main',
          detached: false,
          branches: {},
        } as BranchSummary),
      });
      const svc = new GitService(mockGit);
      const remotes = await svc.getRemotes();
      expect(remotes[0].url).toBe('git@github.com:user/repo.git');
    });
  });

  describe('getTags', () => {
    it('maps tags from git.tags()', async () => {
      const mockGit = createMockGit({
        tags: vi.fn().mockResolvedValue({
          all: ['v0.1.0', 'v0.2.0', 'v1.0.0'],
          latest: 'v1.0.0',
        }),
      });
      const service = new GitService(mockGit);
      const tags = await service.getTags();

      expect(tags).toEqual([
        { name: 'v0.1.0' },
        { name: 'v0.2.0' },
        { name: 'v1.0.0' },
      ]);
    });

    it('returns empty array when no tags', async () => {
      const mockGit = createMockGit({
        tags: vi.fn().mockResolvedValue({ all: [], latest: undefined }),
      });
      const service = new GitService(mockGit);
      const tags = await service.getTags();

      expect(tags).toEqual([]);
    });
  });

  describe('getStashes', () => {
    it('maps stash entries from git.stashList()', async () => {
      const mockGit = createMockGit({
        stashList: vi.fn().mockResolvedValue({
          all: [
            {
              hash: 'aaa',
              date: '2026-04-09',
              message: 'WIP: feature branch',
              author_name: 'johniak',
              author_email: '',
              body: '',
              refs: '',
            },
            {
              hash: 'bbb',
              date: '2026-04-08',
              message: 'save before rebase',
              author_name: 'johniak',
              author_email: '',
              body: '',
              refs: '',
            },
          ],
          total: 2,
          latest: null,
        }),
      });
      const service = new GitService(mockGit);
      const stashes = await service.getStashes();

      expect(stashes).toEqual([
        { index: 0, message: 'WIP: feature branch', date: '2026-04-09' },
        { index: 1, message: 'save before rebase', date: '2026-04-08' },
      ]);
    });

    it('returns empty array when no stashes', async () => {
      const mockGit = createMockGit({
        stashList: vi
          .fn()
          .mockResolvedValue({ all: [], total: 0, latest: null }),
      });
      const service = new GitService(mockGit);
      const stashes = await service.getStashes();

      expect(stashes).toEqual([]);
    });
  });

  describe('getCommits', () => {
    // Helper: build raw git log output with NUL-separated fields
    function rawLogLine(fields: {
      hash: string;
      abbrev: string;
      parents: string;
      message: string;
      author: string;
      email: string;
      date: string;
      refs: string;
    }): string {
      return [
        fields.hash,
        fields.abbrev,
        fields.parents,
        fields.message,
        fields.author,
        fields.email,
        fields.date,
        fields.refs,
      ].join('\x00');
    }

    it('maps linear history with single parent', async () => {
      const mockGit = createMockGit({
        raw: vi.fn().mockResolvedValue(
          [
            rawLogLine({
              hash: 'ccc000',
              abbrev: 'ccc',
              parents: 'bbb000',
              message: 'third commit',
              author: 'john',
              email: 'j@e.com',
              date: '2026-04-09T12:00:00+00:00',
              refs: 'HEAD -> main',
            }),
            rawLogLine({
              hash: 'bbb000',
              abbrev: 'bbb',
              parents: 'aaa000',
              message: 'second commit',
              author: 'john',
              email: 'j@e.com',
              date: '2026-04-09T11:00:00+00:00',
              refs: '',
            }),
            rawLogLine({
              hash: 'aaa000',
              abbrev: 'aaa',
              parents: '',
              message: 'initial commit',
              author: 'john',
              email: 'j@e.com',
              date: '2026-04-09T10:00:00+00:00',
              refs: 'tag: v0.1.0',
            }),
          ].join('\n'),
        ),
      });
      const service = new GitService(mockGit);
      const commits = await service.getCommits({ maxCount: 100 });

      expect(commits).toHaveLength(3);
      expect(commits[0].hash).toBe('ccc000');
      expect(commits[0].hashShort).toBe('ccc');
      expect(commits[0].message).toBe('third commit');
      expect(commits[0].parents).toEqual(['bbb000']);
      expect(commits[0].refs).toEqual(['HEAD -> main']);
    });

    it('parses merge commit with two parents', async () => {
      const mockGit = createMockGit({
        raw: vi.fn().mockResolvedValue(
          rawLogLine({
            hash: 'mmm000',
            abbrev: 'mmm',
            parents: 'aaa000 bbb000',
            message: 'merge feature',
            author: 'john',
            email: 'j@e.com',
            date: '2026-04-09T12:00:00+00:00',
            refs: '',
          }),
        ),
      });
      const service = new GitService(mockGit);
      const commits = await service.getCommits();

      expect(commits[0].parents).toEqual(['aaa000', 'bbb000']);
    });

    it('parses root commit with no parents', async () => {
      const mockGit = createMockGit({
        raw: vi.fn().mockResolvedValue(
          rawLogLine({
            hash: 'aaa000',
            abbrev: 'aaa',
            parents: '',
            message: 'initial',
            author: 'john',
            email: 'j@e.com',
            date: '2026-04-09T10:00:00+00:00',
            refs: '',
          }),
        ),
      });
      const service = new GitService(mockGit);
      const commits = await service.getCommits();

      expect(commits[0].parents).toEqual([]);
    });

    it('parses multiple refs correctly', async () => {
      const mockGit = createMockGit({
        raw: vi.fn().mockResolvedValue(
          rawLogLine({
            hash: 'aaa000',
            abbrev: 'aaa',
            parents: '',
            message: 'commit',
            author: 'john',
            email: 'j@e.com',
            date: '2026-04-09T10:00:00+00:00',
            refs: 'HEAD -> main, origin/main, tag: v1.0',
          }),
        ),
      });
      const service = new GitService(mockGit);
      const commits = await service.getCommits();

      expect(commits[0].refs).toEqual([
        'HEAD -> main',
        'origin/main',
        'tag: v1.0',
      ]);
    });

    it('passes maxCount and skip to git raw', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.getCommits({ maxCount: 50, skip: 200 });

      const args = rawFn.mock.calls[0][0] as string[];
      expect(args).toContain('--max-count=50');
      expect(args).toContain('--skip=200');
    });

    it('does not pass --skip when skip is 0', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.getCommits({ maxCount: 100, skip: 0 });

      const args = rawFn.mock.calls[0][0] as string[];
      expect(args).not.toContain(expect.stringContaining('--skip'));
    });

    it('defaults to --topo-order when logOrder is not specified', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.getCommits({ maxCount: 100 });

      const args = rawFn.mock.calls[0][0] as string[];
      expect(args).toContain('--topo-order');
      expect(args).not.toContain('--date-order');
    });

    it('passes --date-order when logOrder is "date"', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.getCommits({ maxCount: 100, logOrder: 'date' });

      const args = rawFn.mock.calls[0][0] as string[];
      expect(args).toContain('--date-order');
      expect(args).not.toContain('--topo-order');
    });

    it('passes --topo-order when logOrder is "topo"', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.getCommits({ maxCount: 100, logOrder: 'topo' });

      const args = rawFn.mock.calls[0][0] as string[];
      expect(args).toContain('--topo-order');
      expect(args).not.toContain('--date-order');
    });

    it('returns empty array for empty repo', async () => {
      const mockGit = createMockGit({
        raw: vi.fn().mockResolvedValue(''),
      });
      const service = new GitService(mockGit);
      const commits = await service.getCommits();

      expect(commits).toEqual([]);
    });

    it('parent hash splitting: three parents', async () => {
      const mockGit = createMockGit({
        raw: vi.fn().mockResolvedValue(
          rawLogLine({
            hash: 'ooo000',
            abbrev: 'ooo',
            parents: 'aaa000 bbb000 ccc000',
            message: 'octopus merge',
            author: 'john',
            email: 'j@e.com',
            date: '2026-04-09T12:00:00+00:00',
            refs: '',
          }),
        ),
      });
      const service = new GitService(mockGit);
      const commits = await service.getCommits();

      expect(commits[0].parents).toEqual(['aaa000', 'bbb000', 'ccc000']);
    });

    it('passes --all when all is true', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.getCommits({ all: true });

      const args = rawFn.mock.calls[0][0] as string[];
      expect(args).toContain('--branches');
      expect(args).toContain('--remotes');
      expect(args).toContain('--tags');
      expect(args).not.toContain('--all');
    });

    it('does not pass --all when all is false', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.getCommits({ all: false });

      const args = rawFn.mock.calls[0][0] as string[];
      expect(args).not.toContain('--all');
    });
  });

  describe('getCommitFiles', () => {
    it('parses added, modified, deleted files', async () => {
      const mockGit = createMockGit({
        raw: vi
          .fn()
          .mockResolvedValue(
            'A\tsrc/new-file.ts\nM\tsrc/existing.ts\nD\told-file.ts\n',
          ),
      });
      const service = new GitService(mockGit);
      const files = await service.getCommitFiles('abc123');

      expect(files).toEqual([
        { path: 'src/new-file.ts', status: 'A', from: undefined },
        { path: 'src/existing.ts', status: 'M', from: undefined },
        { path: 'old-file.ts', status: 'D', from: undefined },
      ]);
    });

    it('parses renamed files', async () => {
      const mockGit = createMockGit({
        raw: vi.fn().mockResolvedValue('R100\told-name.ts\tnew-name.ts\n'),
      });
      const service = new GitService(mockGit);
      const files = await service.getCommitFiles('abc123');

      expect(files).toEqual([
        { path: 'new-name.ts', status: 'R', from: 'old-name.ts' },
      ]);
    });

    it('returns empty array for empty diff', async () => {
      const mockGit = createMockGit({
        raw: vi.fn().mockResolvedValue(''),
      });
      const service = new GitService(mockGit);
      const files = await service.getCommitFiles('abc123');

      expect(files).toEqual([]);
    });
  });

  describe('getFileDiff', () => {
    it('parses unified diff into hunks and lines', async () => {
      const diffOutput = [
        'diff --git a/file.ts b/file.ts',
        'index abc..def 100644',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -1,3 +1,4 @@',
        ' line1',
        '-old line',
        '+new line',
        '+added line',
        ' line3',
      ].join('\n');

      const rawFn = vi.fn();
      // First call: diff for file content
      rawFn.mockResolvedValueOnce(diffOutput);
      // Second call: diff-tree for file status
      rawFn.mockResolvedValueOnce('M\tfile.ts\n');

      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);
      const diff = await service.getFileDiff('abc123', 'file.ts');

      expect(diff.path).toBe('file.ts');
      expect(diff.status).toBe('M');
      expect(diff.binary).toBe(false);
      expect(diff.hunks).toHaveLength(1);
      expect(diff.hunks[0].header).toContain('@@ -1,3 +1,4 @@');

      const lines = diff.hunks[0].lines;
      expect(lines[0]).toMatchObject({ type: 'context', content: 'line1' });
      expect(lines[1]).toMatchObject({ type: 'removed', content: 'old line' });
      expect(lines[2]).toMatchObject({ type: 'added', content: 'new line' });
      expect(lines[3]).toMatchObject({ type: 'added', content: 'added line' });
      expect(lines[4]).toMatchObject({ type: 'context', content: 'line3' });
    });

    it('handles binary files', async () => {
      const rawFn = vi.fn();
      rawFn.mockResolvedValueOnce(
        'Binary files a/image.png and b/image.png differ\n',
      );
      rawFn.mockResolvedValueOnce('M\timage.png\n');

      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);
      const diff = await service.getFileDiff('abc123', 'image.png');

      expect(diff.binary).toBe(true);
      expect(diff.hunks).toHaveLength(0);
    });

    it('returns empty hunks for no diff', async () => {
      const rawFn = vi.fn();
      rawFn.mockResolvedValueOnce('');
      rawFn.mockResolvedValueOnce('');

      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);
      const diff = await service.getFileDiff('abc123', 'file.ts');

      expect(diff.hunks).toHaveLength(0);
    });
  });

  describe('getWorkingDiff', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitarbor-wd-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    interface RawRoutes {
      diff?: string;
      diffCached?: string;
      lsFilesTracked?: boolean;
    }

    function mockRawAndRoot(routes: RawRoutes) {
      const raw = vi.fn(async (args: string[]) => {
        if (args[0] === 'diff' && args[1] === '--cached') {
          return routes.diffCached ?? '';
        }
        if (args[0] === 'diff') {
          return routes.diff ?? '';
        }
        if (args[0] === 'ls-files') {
          if (routes.lsFilesTracked) return '';
          throw new Error('not in index');
        }
        return '';
      });
      const revparse = vi.fn(async () => `${tmpDir}\n`);
      const mockGit = createMockGit({
        raw,
        revparse,
      } as unknown as Partial<SimpleGit>);
      return { service: new GitService(mockGit), raw };
    }

    it('parses unified diff for a modified unstaged file', async () => {
      const diffOutput = [
        'diff --git a/file.ts b/file.ts',
        'index abc..def 100644',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -1,2 +1,2 @@',
        '-old',
        '+new',
        ' ctx',
      ].join('\n');

      const { service } = mockRawAndRoot({ diff: diffOutput });
      const diff = await service.getWorkingDiff('file.ts', false);

      expect(diff.status).toBe('M');
      expect(diff.binary).toBe(false);
      expect(diff.hunks).toHaveLength(1);
      expect(diff.hunks[0].lines).toHaveLength(3);
      expect(diff.hunks[0].lines[0]).toMatchObject({
        type: 'removed',
        content: 'old',
      });
      expect(diff.hunks[0].lines[1]).toMatchObject({
        type: 'added',
        content: 'new',
      });
    });

    it('passes --cached when isStaged is true', async () => {
      const { service, raw } = mockRawAndRoot({ diffCached: '' });
      await service.getWorkingDiff('file.ts', true);
      expect(raw).toHaveBeenCalledWith(['diff', '--cached', '--', 'file.ts']);
    });

    it('marks binary for "Binary files" diff output', async () => {
      const { service } = mockRawAndRoot({
        diff: 'Binary files a/img.png and b/img.png differ\n',
      });
      const diff = await service.getWorkingDiff('img.png', false);
      expect(diff.binary).toBe(true);
      expect(diff.hunks).toHaveLength(0);
    });

    it('synthesizes a full-addition diff for an untracked text file', async () => {
      fs.writeFileSync(path.join(tmpDir, 'new.ts'), 'alpha\nbeta\ngamma\n');
      const { service } = mockRawAndRoot({
        diff: '',
        lsFilesTracked: false,
      });
      const diff = await service.getWorkingDiff('new.ts', false);

      expect(diff.status).toBe('A');
      expect(diff.binary).toBe(false);
      expect(diff.hunks).toHaveLength(1);
      expect(diff.hunks[0].header).toBe('@@ -0,0 +1,3 @@');
      expect(diff.hunks[0].lines).toHaveLength(3);
      expect(diff.hunks[0].lines.map((l) => l.content)).toEqual([
        'alpha',
        'beta',
        'gamma',
      ]);
      expect(diff.hunks[0].lines.every((l) => l.type === 'added')).toBe(true);
      expect(diff.hunks[0].lines[0]).toMatchObject({
        oldLine: null,
        newLine: 1,
      });
      expect(diff.hunks[0].lines[2]).toMatchObject({
        oldLine: null,
        newLine: 3,
      });
    });

    it('synthesizes a diff for a file without trailing newline', async () => {
      fs.writeFileSync(path.join(tmpDir, 'noeol.ts'), 'a\nb');
      const { service } = mockRawAndRoot({
        diff: '',
        lsFilesTracked: false,
      });
      const diff = await service.getWorkingDiff('noeol.ts', false);

      expect(diff.hunks).toHaveLength(1);
      expect(diff.hunks[0].header).toBe('@@ -0,0 +1,2 @@');
      expect(diff.hunks[0].lines.map((l) => l.content)).toEqual(['a', 'b']);
    });

    it('returns empty hunks for an empty untracked file', async () => {
      fs.writeFileSync(path.join(tmpDir, 'empty.ts'), '');
      const { service } = mockRawAndRoot({
        diff: '',
        lsFilesTracked: false,
      });
      const diff = await service.getWorkingDiff('empty.ts', false);

      expect(diff.status).toBe('A');
      expect(diff.binary).toBe(false);
      expect(diff.hunks).toHaveLength(0);
    });

    it('marks untracked binary files as binary with no hunks', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'blob.bin'),
        Buffer.from([0x89, 0x50, 0x00, 0x4e, 0x47]),
      );
      const { service } = mockRawAndRoot({
        diff: '',
        lsFilesTracked: false,
      });
      const diff = await service.getWorkingDiff('blob.bin', false);

      expect(diff.status).toBe('A');
      expect(diff.binary).toBe(true);
      expect(diff.hunks).toHaveLength(0);
    });

    it('does not synthesize when the file is tracked but unchanged', async () => {
      fs.writeFileSync(path.join(tmpDir, 'tracked.ts'), 'still here\n');
      const { service } = mockRawAndRoot({
        diff: '',
        lsFilesTracked: true,
      });
      const diff = await service.getWorkingDiff('tracked.ts', false);

      expect(diff.status).toBe('M');
      expect(diff.hunks).toHaveLength(0);
    });

    it('never synthesizes for the staged path', async () => {
      fs.writeFileSync(path.join(tmpDir, 'new.ts'), 'x\n');
      const { service, raw } = mockRawAndRoot({
        diffCached: '',
        lsFilesTracked: false,
      });
      const diff = await service.getWorkingDiff('new.ts', true);

      expect(diff.status).toBe('M');
      expect(diff.hunks).toHaveLength(0);
      expect(
        raw.mock.calls.some((c) => (c[0] as string[])[0] === 'ls-files'),
      ).toBe(false);
    });

    it('falls back to empty hunks when untracked file is missing from disk', async () => {
      const { service } = mockRawAndRoot({
        diff: '',
        lsFilesTracked: false,
      });
      const diff = await service.getWorkingDiff('ghost.ts', false);

      expect(diff.status).toBe('M');
      expect(diff.hunks).toHaveLength(0);
    });
  });

  describe('stageFile / unstageFile', () => {
    it('stageFile calls git.add', async () => {
      const addFn = vi.fn().mockResolvedValue(undefined);
      const mockGit = createMockGit({ add: addFn });
      const service = new GitService(mockGit);

      await service.stageFile('src/file.ts');
      expect(addFn).toHaveBeenCalledWith('src/file.ts');
    });

    it('unstageFile calls git reset HEAD', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.unstageFile('src/file.ts');
      expect(rawFn).toHaveBeenCalledWith([
        'reset',
        'HEAD',
        '--',
        'src/file.ts',
      ]);
    });
  });

  describe('pull / fetch / stash', () => {
    it('pull calls git.pull()', async () => {
      const pullFn = vi.fn().mockResolvedValue(undefined);
      const mockGit = createMockGit({ pull: pullFn });
      const service = new GitService(mockGit);
      await service.pull();
      expect(pullFn).toHaveBeenCalled();
    });

    it('fetch calls git.fetch(--all)', async () => {
      const fetchFn = vi.fn().mockResolvedValue(undefined);
      const mockGit = createMockGit({ fetch: fetchFn });
      const service = new GitService(mockGit);
      await service.fetch();
      expect(fetchFn).toHaveBeenCalledWith(['--all']);
    });

    it('stash calls git.raw with push args', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);
      await service.stash();
      expect(rawFn).toHaveBeenCalledWith(['stash', 'push']);
    });

    it('stash passes message and keep-index', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);
      await service.stash('WIP save', true);
      expect(rawFn).toHaveBeenCalledWith([
        'stash',
        'push',
        '-m',
        'WIP save',
        '--keep-index',
      ]);
    });
  });

  describe('merge', () => {
    it('calls git.merge with branch name', async () => {
      const mergeFn = vi.fn().mockResolvedValue({ result: 'success' });
      const mockGit = createMockGit({ merge: mergeFn });
      const service = new GitService(mockGit);
      const result = await service.merge('feature/test');
      expect(mergeFn).toHaveBeenCalledWith(['feature/test']);
      expect(result.conflicts).toEqual([]);
      expect(result.summary).toBe('success');
    });

    it('returns conflicts on merge failure', async () => {
      const mergeFn = vi.fn().mockRejectedValue(new Error('conflict'));
      const statusFn = vi.fn().mockResolvedValue({ conflicted: ['file.ts'] });
      const mockGit = createMockGit({ merge: mergeFn, status: statusFn });
      const service = new GitService(mockGit);
      const result = await service.merge('feature/test');
      expect(result.conflicts).toEqual(['file.ts']);
    });
  });

  describe('rebase', () => {
    it('calls git.raw rebase with branch', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);
      const result = await service.rebase('main');
      expect(rawFn).toHaveBeenCalledWith(['rebase', 'main']);
      expect(result.conflicts).toEqual([]);
    });

    it('returns conflicts on rebase failure', async () => {
      const rawFn = vi.fn().mockRejectedValue(new Error('conflict'));
      const statusFn = vi
        .fn()
        .mockResolvedValue({ conflicted: ['a.ts', 'b.ts'] });
      const mockGit = createMockGit({ raw: rawFn, status: statusFn });
      const service = new GitService(mockGit);
      const result = await service.rebase('main');
      expect(result.conflicts).toEqual(['a.ts', 'b.ts']);
    });
  });

  describe('checkout', () => {
    it('calls git.checkout with branch name', async () => {
      const checkoutFn = vi.fn().mockResolvedValue(undefined);
      const mockGit = createMockGit({ checkout: checkoutFn });
      const service = new GitService(mockGit);

      await service.checkout('feature/test');
      expect(checkoutFn).toHaveBeenCalledWith('feature/test');
    });

    it('calls git.checkout with commit hash', async () => {
      const checkoutFn = vi.fn().mockResolvedValue(undefined);
      const mockGit = createMockGit({ checkout: checkoutFn });
      const service = new GitService(mockGit);

      await service.checkout('abc1234');
      expect(checkoutFn).toHaveBeenCalledWith('abc1234');
    });
  });

  describe('pushBranches', () => {
    it('pushes a single branch without upstream flag', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.pushBranches(
        'origin',
        [{ local: 'main', setUpstream: false }],
        false,
      );
      expect(rawFn).toHaveBeenCalledWith(['push', 'origin', 'main']);
    });

    it('adds -u when any branch requests setUpstream', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.pushBranches(
        'origin',
        [
          { local: 'main', setUpstream: false },
          { local: 'feature/x', setUpstream: true },
        ],
        false,
      );
      expect(rawFn).toHaveBeenCalledWith([
        'push',
        '-u',
        'origin',
        'main',
        'feature/x',
      ]);
    });

    it('uses local:remote refspec when remote name differs', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.pushBranches(
        'origin',
        [{ local: 'feature/x', remote: 'renamed', setUpstream: false }],
        false,
      );
      expect(rawFn).toHaveBeenCalledWith([
        'push',
        'origin',
        'feature/x:renamed',
      ]);
    });

    it('uses plain name refspec when remote name matches local', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.pushBranches(
        'origin',
        [{ local: 'main', remote: 'main', setUpstream: false }],
        false,
      );
      expect(rawFn).toHaveBeenCalledWith(['push', 'origin', 'main']);
    });

    it('appends --tags when includeTags is true', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.pushBranches(
        'origin',
        [{ local: 'main', setUpstream: false }],
        true,
      );
      expect(rawFn).toHaveBeenCalledWith(['push', 'origin', 'main', '--tags']);
    });

    it('does nothing when no branches and no tags', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.pushBranches('origin', [], false);
      expect(rawFn).not.toHaveBeenCalled();
    });

    it('propagates push errors', async () => {
      const rawFn = vi
        .fn()
        .mockRejectedValue(new Error('remote rejected: non-fast-forward'));
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await expect(
        service.pushBranches(
          'origin',
          [{ local: 'main', setUpstream: false }],
          false,
        ),
      ).rejects.toThrow('non-fast-forward');
    });
  });

  describe('createTag', () => {
    it('creates a lightweight tag without force', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.createTag('v1.0', 'abc1234');
      expect(rawFn).toHaveBeenCalledWith(['tag', 'v1.0', 'abc1234']);
    });

    it('creates a lightweight tag with force', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.createTag('v1.0', 'abc1234', { force: true });
      expect(rawFn).toHaveBeenCalledWith(['tag', '-f', 'v1.0', 'abc1234']);
    });

    it('creates an annotated tag with message', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.createTag('v1.0', 'abc1234', { message: 'Release 1.0' });
      expect(rawFn).toHaveBeenCalledWith([
        'tag',
        '-a',
        'v1.0',
        '-m',
        'Release 1.0',
        'abc1234',
      ]);
    });

    it('creates an annotated tag with force', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.createTag('v1.0', 'abc1234', {
        message: 'Release 1.0',
        force: true,
      });
      expect(rawFn).toHaveBeenCalledWith([
        'tag',
        '-a',
        '-f',
        'v1.0',
        '-m',
        'Release 1.0',
        'abc1234',
      ]);
    });

    it('treats empty-string message as annotated, not lightweight', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.createTag('v1.0', 'abc1234', { message: '' });
      expect(rawFn).toHaveBeenCalledWith([
        'tag',
        '-a',
        'v1.0',
        '-m',
        '',
        'abc1234',
      ]);
    });

    it('propagates errors from git (e.g. tag already exists)', async () => {
      const rawFn = vi
        .fn()
        .mockRejectedValue(new Error("tag 'v1.0' already exists"));
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await expect(service.createTag('v1.0', 'abc1234')).rejects.toThrow(
        "tag 'v1.0' already exists",
      );
    });
  });

  describe('deleteTag', () => {
    it('calls git tag -d with tag name', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.deleteTag('v1.0');
      expect(rawFn).toHaveBeenCalledWith(['tag', '-d', 'v1.0']);
    });

    it('propagates errors when tag does not exist', async () => {
      const rawFn = vi
        .fn()
        .mockRejectedValue(new Error("tag 'missing' not found"));
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await expect(service.deleteTag('missing')).rejects.toThrow(
        "tag 'missing' not found",
      );
    });
  });

  describe('pushTag', () => {
    it('pushes tag to origin', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.pushTag('v1.0', 'origin');
      expect(rawFn).toHaveBeenCalledWith(['push', 'origin', 'refs/tags/v1.0']);
    });

    it('pushes tag to custom remote', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.pushTag('v1.0', 'upstream');
      expect(rawFn).toHaveBeenCalledWith([
        'push',
        'upstream',
        'refs/tags/v1.0',
      ]);
    });
  });

  describe('deleteRemoteTag', () => {
    it('deletes tag from origin', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.deleteRemoteTag('v1.0', 'origin');
      expect(rawFn).toHaveBeenCalledWith([
        'push',
        'origin',
        '--delete',
        'refs/tags/v1.0',
      ]);
    });

    it('deletes tag from custom remote', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const service = new GitService(mockGit);

      await service.deleteRemoteTag('v1.0', 'upstream');
      expect(rawFn).toHaveBeenCalledWith([
        'push',
        'upstream',
        '--delete',
        'refs/tags/v1.0',
      ]);
    });
  });

  describe('searchCommits', () => {
    function makeRawWithLog() {
      // Single commit log line in NUL-separated format expected by parser.
      return [
        'aaa111',
        'aaa',
        'parent1',
        'fix: thing',
        'john',
        'j@e.com',
        '2026-04-09T12:00:00+00:00',
        'HEAD -> main',
      ].join('\x00');
    }

    it('returns empty array for blank query without invoking git', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const result = await new GitService(mockGit).searchCommits({
        query: '',
        mode: 'message',
      });
      expect(result).toEqual([]);
      expect(rawFn).not.toHaveBeenCalled();
    });

    it('uses --grep -i for message mode', async () => {
      const rawFn = vi.fn().mockResolvedValue(makeRawWithLog());
      const mockGit = createMockGit({ raw: rawFn });
      await new GitService(mockGit).searchCommits({
        query: 'fix',
        mode: 'message',
      });
      const args = rawFn.mock.calls[0][0] as string[];
      expect(args).toContain('--all');
      expect(args).toContain('-i');
      expect(args).toContain('--grep=fix');
    });

    it('uses --author for author mode', async () => {
      const rawFn = vi.fn().mockResolvedValue(makeRawWithLog());
      const mockGit = createMockGit({ raw: rawFn });
      await new GitService(mockGit).searchCommits({
        query: 'jan',
        mode: 'author',
      });
      const args = rawFn.mock.calls[0][0] as string[];
      expect(args).toContain('--author=jan');
    });

    it('uses pickaxe -S for file-content mode', async () => {
      const rawFn = vi.fn().mockResolvedValue(makeRawWithLog());
      const mockGit = createMockGit({ raw: rawFn });
      await new GitService(mockGit).searchCommits({
        query: 'TODO',
        mode: 'file-content',
      });
      const args = rawFn.mock.calls[0][0] as string[];
      expect(args).toContain('-STODO');
    });

    it('rejects non-hex query for sha mode without invoking git', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const result = await new GitService(mockGit).searchCommits({
        query: 'not-a-sha',
        mode: 'sha',
      });
      expect(result).toEqual([]);
      expect(rawFn).not.toHaveBeenCalled();
    });

    it('passes --since / --until when provided', async () => {
      const rawFn = vi.fn().mockResolvedValue(makeRawWithLog());
      const mockGit = createMockGit({ raw: rawFn });
      await new GitService(mockGit).searchCommits({
        query: 'fix',
        mode: 'message',
        since: '2026-01-01',
        until: '2026-04-01',
      });
      const args = rawFn.mock.calls[0][0] as string[];
      expect(args).toContain('--since=2026-01-01');
      expect(args).toContain('--until=2026-04-01');
    });

    it('parses commit results from log output', async () => {
      const rawFn = vi.fn().mockResolvedValue(makeRawWithLog());
      const mockGit = createMockGit({ raw: rawFn });
      const result = await new GitService(mockGit).searchCommits({
        query: 'fix',
        mode: 'message',
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        hash: 'aaa111',
        hashShort: 'aaa',
        message: 'fix: thing',
        authorName: 'john',
      });
    });
  });

  describe('deleteBranch', () => {
    it('runs branch -d for soft delete', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      const result = await new GitService(mockGit).deleteBranch(
        'feat/foo',
        false,
      );
      expect(result).toEqual({});
      expect(rawFn).toHaveBeenCalledWith(['branch', '-d', 'feat/foo']);
    });

    it('runs branch -D for force delete', async () => {
      const rawFn = vi.fn().mockResolvedValue('');
      const mockGit = createMockGit({ raw: rawFn });
      await new GitService(mockGit).deleteBranch('feat/foo', true);
      expect(rawFn).toHaveBeenCalledWith(['branch', '-D', 'feat/foo']);
    });

    it('returns error when git refuses (e.g. unmerged branch)', async () => {
      const rawFn = vi.fn().mockRejectedValue(new Error('not fully merged'));
      const mockGit = createMockGit({ raw: rawFn });
      const result = await new GitService(mockGit).deleteBranch(
        'feat/foo',
        false,
      );
      expect(result.error).toContain('not fully merged');
    });
  });

  describe('conflict resolution', () => {
    // revparse returns ".git" for --git-dir queries; getGitDir then anchors
    // it to repo root via getRepoRoot (which also calls revparse).
    function makeRevparse(gitDirRel = '.git', repoRoot = '/repo') {
      return vi.fn(async (args: string[]) => {
        if (args[0] === '--git-dir') return gitDirRel;
        if (args[0] === '--show-toplevel') return repoRoot;
        return '';
      });
    }

    function existsSwitch(presentPaths: string[]) {
      return (p: fs.PathLike) =>
        presentPaths.some((seg) => String(p).endsWith(seg));
    }

    let existsSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      existsSpy = vi.spyOn(fs, 'existsSync');
    });

    afterEach(() => {
      existsSpy.mockRestore();
    });

    describe('getOperationInProgress', () => {
      it('returns merge when MERGE_HEAD exists', async () => {
        existsSpy.mockImplementation(existsSwitch(['MERGE_HEAD']));
        const mockGit = createMockGit({
          revparse: makeRevparse(),
        } as unknown as Partial<SimpleGit>);
        const result = await new GitService(mockGit).getOperationInProgress();
        expect(result).toEqual({ kind: 'merge' });
      });

      it('returns rebase when rebase-merge dir exists', async () => {
        existsSpy.mockImplementation(existsSwitch(['rebase-merge']));
        const mockGit = createMockGit({
          revparse: makeRevparse(),
        } as unknown as Partial<SimpleGit>);
        const result = await new GitService(mockGit).getOperationInProgress();
        expect(result).toEqual({ kind: 'rebase' });
      });

      it('returns rebase when rebase-apply dir exists', async () => {
        existsSpy.mockImplementation(existsSwitch(['rebase-apply']));
        const mockGit = createMockGit({
          revparse: makeRevparse(),
        } as unknown as Partial<SimpleGit>);
        const result = await new GitService(mockGit).getOperationInProgress();
        expect(result).toEqual({ kind: 'rebase' });
      });

      it('returns cherry-pick when CHERRY_PICK_HEAD exists', async () => {
        existsSpy.mockImplementation(existsSwitch(['CHERRY_PICK_HEAD']));
        const mockGit = createMockGit({
          revparse: makeRevparse(),
        } as unknown as Partial<SimpleGit>);
        const result = await new GitService(mockGit).getOperationInProgress();
        expect(result).toEqual({ kind: 'cherry-pick' });
      });

      it('returns null when no operation markers present', async () => {
        existsSpy.mockImplementation(() => false);
        const mockGit = createMockGit({
          revparse: makeRevparse(),
        } as unknown as Partial<SimpleGit>);
        const result = await new GitService(mockGit).getOperationInProgress();
        expect(result).toBeNull();
      });
    });

    describe('resolveConflict', () => {
      it('uses --ours for "mine" during merge, then stages', async () => {
        existsSpy.mockImplementation(existsSwitch(['MERGE_HEAD']));
        const rawFn = vi.fn().mockResolvedValue('');
        const mockGit = createMockGit({
          revparse: makeRevparse(),
          raw: rawFn,
        } as unknown as Partial<SimpleGit>);
        const result = await new GitService(mockGit).resolveConflict(
          'src/foo.ts',
          'mine',
        );
        expect(result).toEqual({});
        expect(rawFn).toHaveBeenNthCalledWith(1, [
          'checkout',
          '--ours',
          '--',
          'src/foo.ts',
        ]);
        expect(rawFn).toHaveBeenNthCalledWith(2, ['add', '--', 'src/foo.ts']);
      });

      it('uses --theirs for "theirs" during merge', async () => {
        existsSpy.mockImplementation(existsSwitch(['MERGE_HEAD']));
        const rawFn = vi.fn().mockResolvedValue('');
        const mockGit = createMockGit({
          revparse: makeRevparse(),
          raw: rawFn,
        } as unknown as Partial<SimpleGit>);
        await new GitService(mockGit).resolveConflict('src/foo.ts', 'theirs');
        expect(rawFn).toHaveBeenNthCalledWith(1, [
          'checkout',
          '--theirs',
          '--',
          'src/foo.ts',
        ]);
      });

      it('inverts flag during rebase: "mine" maps to --theirs', async () => {
        existsSpy.mockImplementation(existsSwitch(['rebase-merge']));
        const rawFn = vi.fn().mockResolvedValue('');
        const mockGit = createMockGit({
          revparse: makeRevparse(),
          raw: rawFn,
        } as unknown as Partial<SimpleGit>);
        await new GitService(mockGit).resolveConflict('src/foo.ts', 'mine');
        expect(rawFn).toHaveBeenNthCalledWith(1, [
          'checkout',
          '--theirs',
          '--',
          'src/foo.ts',
        ]);
      });

      it('inverts flag during rebase: "theirs" maps to --ours', async () => {
        existsSpy.mockImplementation(existsSwitch(['rebase-merge']));
        const rawFn = vi.fn().mockResolvedValue('');
        const mockGit = createMockGit({
          revparse: makeRevparse(),
          raw: rawFn,
        } as unknown as Partial<SimpleGit>);
        await new GitService(mockGit).resolveConflict('src/foo.ts', 'theirs');
        expect(rawFn).toHaveBeenNthCalledWith(1, [
          'checkout',
          '--ours',
          '--',
          'src/foo.ts',
        ]);
      });

      it('returns error string on raw failure', async () => {
        existsSpy.mockImplementation(existsSwitch(['MERGE_HEAD']));
        const rawFn = vi.fn().mockRejectedValue(new Error('boom'));
        const mockGit = createMockGit({
          revparse: makeRevparse(),
          raw: rawFn,
        } as unknown as Partial<SimpleGit>);
        const result = await new GitService(mockGit).resolveConflict(
          'src/foo.ts',
          'mine',
        );
        expect(result.error).toContain('Resolve src/foo.ts failed');
      });
    });

    describe('markResolved', () => {
      it('runs git add', async () => {
        const rawFn = vi.fn().mockResolvedValue('');
        const mockGit = createMockGit({ raw: rawFn });
        const result = await new GitService(mockGit).markResolved('foo.ts');
        expect(result).toEqual({});
        expect(rawFn).toHaveBeenCalledWith(['add', '--', 'foo.ts']);
      });
    });

    describe('markUnresolved', () => {
      it('runs git checkout --merge to restore conflict markers', async () => {
        const rawFn = vi.fn().mockResolvedValue('');
        const mockGit = createMockGit({ raw: rawFn });
        const result = await new GitService(mockGit).markUnresolved('foo.ts');
        expect(result).toEqual({});
        expect(rawFn).toHaveBeenCalledWith([
          'checkout',
          '--merge',
          '--',
          'foo.ts',
        ]);
      });
    });

    describe('continueOperation', () => {
      it('runs commit --no-edit during merge when conflicts cleared', async () => {
        existsSpy.mockImplementation(existsSwitch(['MERGE_HEAD']));
        const rawFn = vi.fn().mockResolvedValue('');
        const statusFn = vi.fn().mockResolvedValue({ conflicted: [] });
        const mockGit = createMockGit({
          revparse: makeRevparse(),
          status: statusFn,
          raw: rawFn,
        } as unknown as Partial<SimpleGit>);
        const result = await new GitService(mockGit).continueOperation();
        expect(result).toEqual({});
        expect(rawFn).toHaveBeenCalledWith(['commit', '--no-edit']);
      });

      it('runs rebase --continue with editor disabled', async () => {
        existsSpy.mockImplementation(existsSwitch(['rebase-merge']));
        const rawFn = vi.fn().mockResolvedValue('');
        const envFn = vi.fn();
        const chained = { env: envFn, raw: rawFn };
        envFn.mockReturnValue(chained);
        const statusFn = vi.fn().mockResolvedValue({ conflicted: [] });
        const mockGit = createMockGit({
          revparse: makeRevparse(),
          status: statusFn,
          env: envFn,
          raw: rawFn,
        } as unknown as Partial<SimpleGit>);
        await new GitService(mockGit).continueOperation();
        expect(envFn).toHaveBeenCalledWith('GIT_EDITOR', ':');
        expect(envFn).toHaveBeenCalledWith('GIT_SEQUENCE_EDITOR', ':');
        expect(rawFn).toHaveBeenCalledWith(['rebase', '--continue']);
      });

      it('refuses with error when conflicts still remain', async () => {
        existsSpy.mockImplementation(existsSwitch(['MERGE_HEAD']));
        const statusFn = vi
          .fn()
          .mockResolvedValue({ conflicted: ['a.ts', 'b.ts'] });
        const mockGit = createMockGit({
          revparse: makeRevparse(),
          status: statusFn,
        } as unknown as Partial<SimpleGit>);
        const result = await new GitService(mockGit).continueOperation();
        expect(result.error).toContain('2 unresolved');
      });

      it('returns error when no operation in progress', async () => {
        existsSpy.mockImplementation(() => false);
        const mockGit = createMockGit({
          revparse: makeRevparse(),
        } as unknown as Partial<SimpleGit>);
        const result = await new GitService(mockGit).continueOperation();
        expect(result.error).toBe('No operation in progress');
      });
    });

    describe('abortOperation', () => {
      it('runs merge --abort during merge', async () => {
        existsSpy.mockImplementation(existsSwitch(['MERGE_HEAD']));
        const rawFn = vi.fn().mockResolvedValue('');
        const mockGit = createMockGit({
          revparse: makeRevparse(),
          raw: rawFn,
        } as unknown as Partial<SimpleGit>);
        const result = await new GitService(mockGit).abortOperation();
        expect(result).toEqual({});
        expect(rawFn).toHaveBeenCalledWith(['merge', '--abort']);
      });

      it('runs rebase --abort during rebase', async () => {
        existsSpy.mockImplementation(existsSwitch(['rebase-merge']));
        const rawFn = vi.fn().mockResolvedValue('');
        const mockGit = createMockGit({
          revparse: makeRevparse(),
          raw: rawFn,
        } as unknown as Partial<SimpleGit>);
        await new GitService(mockGit).abortOperation();
        expect(rawFn).toHaveBeenCalledWith(['rebase', '--abort']);
      });

      it('returns error when no operation in progress', async () => {
        existsSpy.mockImplementation(() => false);
        const mockGit = createMockGit({
          revparse: makeRevparse(),
        } as unknown as Partial<SimpleGit>);
        const result = await new GitService(mockGit).abortOperation();
        expect(result.error).toBe('No operation in progress');
      });
    });
  });
});
