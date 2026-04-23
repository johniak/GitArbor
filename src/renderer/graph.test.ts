import { describe, it, expect } from 'vitest';
import {
  computeGraph,
  computeGraphIncremental,
  createGraphState,
} from './graph';
import type { Commit } from './types';

function commit(hash: string, parents: string[], message = ''): Commit {
  return {
    hash,
    hashShort: hash.slice(0, 7),
    message,
    authorName: 'test',
    authorEmail: 'test@test.com',
    date: '',
    dateRelative: '',
    parents,
    refs: [],
  };
}

describe('computeGraph', () => {
  it('linear history — single lane', () => {
    const commits = [
      commit('ccc', ['bbb']),
      commit('bbb', ['aaa']),
      commit('aaa', []),
    ];
    const rows = computeGraph(commits);

    expect(rows).toHaveLength(3);
    // All on lane 0
    expect(rows[0].commitLane).toBe(0);
    expect(rows[1].commitLane).toBe(0);
    expect(rows[2].commitLane).toBe(0);
    // Max 1 lane
    expect(rows[0].laneCount).toBe(1);
  });

  it('feature branch fork — new lane appears', () => {
    // c3 (main) → c2 → c1
    // b1 (feature, forked from c2)
    // Timeline: c3, b1, c2, c1
    const commits = [
      commit('c3c', ['c2c']),
      commit('b1b', ['c2c']), // also points to c2 — will share lane
      commit('c2c', ['c1c']),
      commit('c1c', []),
    ];
    const rows = computeGraph(commits);

    // c3 on lane 0
    expect(rows[0].commitLane).toBe(0);
    // b1 needs a lane expecting c2c — lane 0 already expects c2c, so b1 goes to lane 0
    // Actually b1 also expects c2c so it would go to same lane
    // This means both c3 and b1 point to c2c — first one gets lane 0, second needs new lane
    // c3 takes lane 0, sets it to expect c2c
    // b1 finds lane 0 expects c2c — but b1's hash is b1b, not c2c. b1b gets a new lane.
    expect(rows[1].commitLane).toBe(1); // b1 on new lane
    // After b1: lane 1 expects c2c (b1's parent)
    // c2 is expected by both lane 0 and lane 1 — takes the first one (lane 0)
    expect(rows[2].commitLane).toBe(0);
  });

  it('merge commit — connects two lanes', () => {
    // M merges main (a2) and feature (b1)
    // Timeline: M, b1, a2, a1
    const commits = [
      commit('MMM', ['a2a', 'b1b']), // merge: 2 parents
      commit('b1b', ['a1a']),
      commit('a2a', ['a1a']),
      commit('a1a', []),
    ];
    const rows = computeGraph(commits);

    // M is on lane 0, has a fork segment for second parent
    expect(rows[0].commitLane).toBe(0);
    const forkSeg = rows[0].segments.find((s) => s.type === 'fork');
    expect(forkSeg).toBeDefined();

    // After M: lane 0 expects a2a, new lane expects b1b
    // b1 goes to the lane expecting b1b
    expect(rows[1].commitLane).toBe(1);
  });

  it('root commit — lane ends', () => {
    const commits = [commit('aaa', [])];
    const rows = computeGraph(commits);

    expect(rows).toHaveLength(1);
    expect(rows[0].commitLane).toBe(0);
    expect(rows[0].segments.find((s) => s.type === 'dot')).toBeDefined();
  });

  it('incremental computation produces same result', () => {
    const commits = [
      commit('ccc', ['bbb']),
      commit('bbb', ['aaa']),
      commit('aaa', []),
    ];

    const fullRows = computeGraph(commits);

    // Split into two pages
    const page1 = commits.slice(0, 2);
    const page2 = commits.slice(2);

    const result1 = computeGraphIncremental(page1, createGraphState());
    const result2 = computeGraphIncremental(page2, result1.state);

    const incrementalRows = [...result1.rows, ...result2.rows];

    expect(incrementalRows).toHaveLength(fullRows.length);
    for (let i = 0; i < fullRows.length; i++) {
      expect(incrementalRows[i].commitLane).toBe(fullRows[i].commitLane);
      expect(incrementalRows[i].commitColor).toBe(fullRows[i].commitColor);
    }
  });

  it('converging branches — two lanes expecting same commit get merged', () => {
    // tip and main both descend from common ancestor
    // tip → parent: common (lane 0, sets lane to expect "common")
    // main → parent: common (lane 1, also sets lane to expect "common")
    // common arrives — two lanes expect it → one gets commit, other gets merge curve
    const commits = [
      commit('tip', ['common']),
      commit('main', ['common']),
      commit('common', []),
    ];
    const rows = computeGraph(commits);

    // Both tip and main are new lanes (no child above)
    expect(rows[0].isNewLane).toBe(true);
    expect(rows[1].isNewLane).toBe(true);

    // common: should have a converge segment closing the extra lane
    const convergeSegs = rows[2].segments.filter((s) => s.type === 'converge');
    expect(convergeSegs.length).toBeGreaterThan(0);

    // common lands on one lane, other lane is closed
    expect(rows[2].isNewLane).toBe(false);
  });

  it('branch tip has isNewLane = true, child has isNewLane = false', () => {
    // linear: c → b → a
    // c is new lane (first commit, nothing above expects it)
    // b is NOT new lane (c's parent points to b, so lane expects b)
    const commits = [
      commit('ccc', ['bbb']),
      commit('bbb', ['aaa']),
      commit('aaa', []),
    ];
    const rows = computeGraph(commits);

    expect(rows[0].isNewLane).toBe(true); // first commit ever — new lane
    expect(rows[1].isNewLane).toBe(false); // expected by lane from ccc
    expect(rows[2].isNewLane).toBe(false); // expected by lane from bbb
  });

  it('multi-branch: pipes continue between branch tip and fork point', () => {
    // Scenario: feature branch with 2 commits, main with 1, sharing ancestor
    // Timeline (newest first, like --all):
    //   feat-2 (feature tip) → parent: feat-1
    //   main-1 (main tip) → parent: base
    //   feat-1 (feature) → parent: base
    //   base (fork point, both converge here)
    const commits = [
      commit('feat-2', ['feat-1']), // row 0: new lane (feature)
      commit('main-1', ['base']), // row 1: new lane (main)
      commit('feat-1', ['base']), // row 2: feature lane continues
      commit('base', []), // row 3: both converge
    ];
    const rows = computeGraph(commits);

    // Row 0: feat-2 creates lane 0
    expect(rows[0].commitLane).toBe(0);
    expect(rows[0].isNewLane).toBe(true);

    // Row 1: main-1 creates lane 1
    expect(rows[1].commitLane).toBe(1);
    expect(rows[1].isNewLane).toBe(true);
    // Row 1 should have a PIPE for lane 0 (feature still active)
    const row1Pipes = rows[1].segments.filter(
      (s) => s.type === 'pipe' && s.lane === 0,
    );
    expect(row1Pipes).toHaveLength(1);

    // Row 2: feat-1 lands on lane 0 (expected by feature lane)
    expect(rows[2].commitLane).toBe(0);
    expect(rows[2].isNewLane).toBe(false);
    // Row 2 should have a PIPE for lane 1 (main still active)
    const row2Pipes = rows[2].segments.filter(
      (s) => s.type === 'pipe' && s.lane === 1,
    );
    expect(row2Pipes).toHaveLength(1);

    // Row 3: base — both lanes expect it → converge
    expect(rows[3].commitLane).toBe(0);
    const converge = rows[3].segments.filter((s) => s.type === 'converge');
    expect(converge).toHaveLength(1);
  });

  it('laneCount stays sufficient when branch pipe is active', () => {
    const commits = [
      commit('feat', ['base']),
      commit('m1', ['base']),
      commit('base', []),
    ];
    const rows = computeGraph(commits);

    // Row 1: both lanes active → laneCount >= 2
    expect(rows[1].laneCount).toBeGreaterThanOrEqual(2);
    // Row 1: feat pipe exists
    const featurePipe = rows[1].segments.find(
      (s) => s.type === 'pipe' && s.lane === 0,
    );
    expect(featurePipe).toBeDefined();
  });

  it('pipe exists on every row between branch tip and fork point', () => {
    // feature: 1 commit, main: 3 commits between feature and fork point
    const commits = [
      commit('feat', ['base']), // row 0: feature tip
      commit('m3', ['m2']), // row 1: main
      commit('m2', ['m1']), // row 2: main
      commit('m1', ['base']), // row 3: main
      commit('base', []), // row 4: fork point
    ];
    const rows = computeGraph(commits);

    // Rows 1-3: feature lane (lane 0) should have pipes
    for (let i = 1; i <= 3; i++) {
      const featurePipe = rows[i].segments.find(
        (s) => s.type === 'pipe' && s.lane === 0,
      );
      expect(
        featurePipe,
        `Row ${i} should have feature pipe on lane 0`,
      ).toBeDefined();
    }

    // Row 4: converge at base
    const converge = rows[4].segments.filter((s) => s.type === 'converge');
    expect(converge.length).toBeGreaterThan(0);
  });

  it('each row has exactly one dot segment', () => {
    const commits = [
      commit('MMM', ['a2a', 'b1b']),
      commit('b1b', ['a1a']),
      commit('a2a', ['a1a']),
      commit('a1a', []),
    ];
    const rows = computeGraph(commits);

    for (const row of rows) {
      const dots = row.segments.filter((s) => s.type === 'dot');
      expect(dots).toHaveLength(1);
    }
  });
});
