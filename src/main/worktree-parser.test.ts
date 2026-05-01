import { describe, it, expect } from 'vitest';
import { parseWorktreePorcelain } from './worktree-parser';

describe('parseWorktreePorcelain', () => {
  it('parses a single main worktree', () => {
    const out = `worktree /Users/me/proj
HEAD abc123def
branch refs/heads/main
`;
    expect(parseWorktreePorcelain(out)).toEqual([
      {
        path: '/Users/me/proj',
        head: 'abc123def',
        branch: 'main',
        isDetached: false,
        isMain: true,
        isBare: false,
        locked: false,
        prunable: false,
      },
    ]);
  });

  it('parses main + linked worktrees', () => {
    const out = `worktree /Users/me/proj
HEAD abc123
branch refs/heads/main

worktree /Users/me/proj-feature
HEAD def456
branch refs/heads/feature

worktree /Users/me/proj-bugfix
HEAD 789xyz
branch refs/heads/bugfix
`;
    const r = parseWorktreePorcelain(out);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ branch: 'main', isMain: true });
    expect(r[1]).toMatchObject({ branch: 'feature', isMain: false });
    expect(r[2]).toMatchObject({ branch: 'bugfix', isMain: false });
  });

  it('parses detached HEAD worktree', () => {
    const out = `worktree /Users/me/proj
HEAD abc123
branch refs/heads/main

worktree /Users/me/proj-detached
HEAD def456
detached
`;
    const r = parseWorktreePorcelain(out);
    expect(r[1]).toMatchObject({ head: 'def456', isDetached: true });
    expect(r[1].branch).toBeUndefined();
  });

  it('parses locked worktree with reason', () => {
    const out = `worktree /Users/me/proj
HEAD abc123
branch refs/heads/main

worktree /Users/me/proj-archive
HEAD def456
branch refs/heads/archive
locked portable drive not connected
`;
    const r = parseWorktreePorcelain(out);
    expect(r[1]).toMatchObject({
      locked: true,
      lockReason: 'portable drive not connected',
    });
  });

  it('parses locked worktree without reason', () => {
    const out = `worktree /Users/me/proj
HEAD abc123
branch refs/heads/main

worktree /Users/me/proj-locked
HEAD def456
branch refs/heads/locked
locked
`;
    const r = parseWorktreePorcelain(out);
    expect(r[1]).toMatchObject({ locked: true });
    expect(r[1].lockReason).toBeUndefined();
  });

  it('parses prunable worktree', () => {
    const out = `worktree /Users/me/proj
HEAD abc123
branch refs/heads/main

worktree /Users/me/proj-deleted
HEAD def456
branch refs/heads/old
prunable gitdir file points to non-existent location
`;
    const r = parseWorktreePorcelain(out);
    expect(r[1]).toMatchObject({
      prunable: true,
      prunableReason: 'gitdir file points to non-existent location',
    });
  });

  it('parses bare main repo', () => {
    const out = `worktree /Users/me/proj.git
bare

worktree /Users/me/proj-feature
HEAD abc123
branch refs/heads/feature
`;
    const r = parseWorktreePorcelain(out);
    expect(r[0]).toMatchObject({
      path: '/Users/me/proj.git',
      isBare: true,
      isMain: true,
      head: '',
    });
    expect(r[0].branch).toBeUndefined();
    expect(r[1]).toMatchObject({ branch: 'feature', isMain: false });
  });

  it('handles trailing whitespace and CRLF', () => {
    const out =
      'worktree /p\r\nHEAD aaa\r\nbranch refs/heads/main\r\n\r\nworktree /q\r\nHEAD bbb\r\nbranch refs/heads/feat\r\n';
    const r = parseWorktreePorcelain(out);
    expect(r).toHaveLength(2);
    expect(r[0].path).toBe('/p');
    expect(r[1].branch).toBe('feat');
  });

  it('returns empty array for empty input', () => {
    expect(parseWorktreePorcelain('')).toEqual([]);
    expect(parseWorktreePorcelain('\n\n')).toEqual([]);
  });

  it('ignores unknown keys (forward compat)', () => {
    const out = `worktree /p
HEAD abc
branch refs/heads/main
some-future-key with-value
`;
    const r = parseWorktreePorcelain(out);
    expect(r[0]).toMatchObject({ path: '/p', branch: 'main' });
  });
});
