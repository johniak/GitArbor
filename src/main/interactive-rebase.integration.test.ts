/**
 * Real-git integration test for runInteractiveRebase. Builds a tiny temp
 * repo, runs the rebase, asserts on the resulting log. Skipped on CI where
 * spawning the Electron binary as ELECTRON_RUN_AS_NODE is awkward, but in
 * dev `bun run test` (Node-only) it executes directly via the local Node.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import simpleGit from 'simple-git';
import {
  cleanupInteractiveRebaseState,
  configureInteractiveRebase,
  runInteractiveRebase,
} from './interactive-rebase';
import type { RebaseStep } from '../shared/rebase-types';

let workDir: string;
let baseHash: string;
let homeHash: string;
let aboutHash: string;
let wipHash: string;

beforeEach(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gitarbor-rebase-itest-'));
  workDir = tmp;
  configureInteractiveRebase(path.join(tmp, '_state'));

  const git = simpleGit(workDir);
  await git.init();
  await git.addConfig('user.email', 'x@x');
  await git.addConfig('user.name', 'X');
  await git.addConfig('commit.gpgsign', 'false');

  fs.writeFileSync(path.join(workDir, 'README.md'), '# base\n');
  await git.add('.');
  await git.commit('base');
  baseHash = (await git.raw(['rev-parse', 'HEAD'])).trim();

  fs.writeFileSync(path.join(workDir, 'home.txt'), 'home\n');
  await git.add('.');
  await git.commit('add home');
  homeHash = (await git.raw(['rev-parse', 'HEAD'])).trim();

  fs.writeFileSync(path.join(workDir, 'about.txt'), 'about\n');
  await git.add('.');
  await git.commit('add about');
  aboutHash = (await git.raw(['rev-parse', 'HEAD'])).trim();

  fs.appendFileSync(path.join(workDir, 'about.txt'), 'DEBUG\n');
  await git.add('.');
  await git.commit('WIP debug');
  wipHash = (await git.raw(['rev-parse', 'HEAD'])).trim();
});

afterEach(() => {
  cleanupInteractiveRebaseState(workDir);
  if (workDir && fs.existsSync(workDir)) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

const step = (
  hash: string,
  hashShort: string,
  subject: string,
  action: RebaseStep['action'] = 'pick',
  newMessage?: string,
): RebaseStep => ({
  hash,
  hashShort,
  subject,
  authorName: 'X',
  authorEmail: 'x@x',
  date: '2026-01-01T00:00:00Z',
  parents: [],
  refs: [],
  action,
  newMessage,
});

describe('runInteractiveRebase', () => {
  it('drop removes the commit from history', async () => {
    const result = await runInteractiveRebase(workDir, {
      baseHash,
      // newest-first
      steps: [
        step(wipHash, wipHash.slice(0, 7), 'WIP debug', 'drop'),
        step(aboutHash, aboutHash.slice(0, 7), 'add about'),
        step(homeHash, homeHash.slice(0, 7), 'add home'),
      ],
    });
    expect(result.error).toBeUndefined();
    expect(result.conflicts).toEqual([]);

    const log = await simpleGit(workDir).raw([
      'log',
      `${baseHash}..HEAD`,
      '--format=%s',
    ]);
    const subjects = log.trim().split('\n');
    expect(subjects).toEqual(['add about', 'add home']);
  });

  it('reword changes the subject', async () => {
    const result = await runInteractiveRebase(workDir, {
      baseHash,
      steps: [
        step(wipHash, wipHash.slice(0, 7), 'WIP debug'),
        step(
          aboutHash,
          aboutHash.slice(0, 7),
          'add about',
          'reword',
          'about renamed',
        ),
        step(homeHash, homeHash.slice(0, 7), 'add home'),
      ],
    });
    expect(result.error).toBeUndefined();

    const log = await simpleGit(workDir).raw([
      'log',
      `${baseHash}..HEAD`,
      '--format=%s',
    ]);
    expect(log).toContain('about renamed');
    expect(log).not.toContain('add about\n');
  });
});
