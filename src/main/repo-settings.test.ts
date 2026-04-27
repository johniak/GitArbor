import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  _resetRepoSettingsState,
  configureRepoSettings,
  flushRepoSettings,
  loadRepoSettings,
  settingsFilePath,
  updateRepoSettings,
} from './repo-settings';
import { DEFAULT_REPO_SETTINGS } from '../shared/repo-settings-types';

describe('repo-settings', () => {
  let tmpDir: string;
  const REPO = '/fake/repo/path';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arbor-settings-'));
    _resetRepoSettingsState();
    configureRepoSettings(tmpDir);
  });

  afterEach(() => {
    _resetRepoSettingsState();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadRepoSettings', () => {
    it('returns defaults (with path filled in) when no file exists', () => {
      const s = loadRepoSettings(REPO);
      expect(s).toEqual({ ...DEFAULT_REPO_SETTINGS, path: REPO });
    });

    it('merges partial file content with defaults', () => {
      const filePath = settingsFilePath(REPO);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          schemaVersion: 1,
          graph: { showAllBranches: false },
          columns: { graph: 123 },
        }),
      );
      _resetRepoSettingsState();
      configureRepoSettings(tmpDir);

      const s = loadRepoSettings(REPO);
      expect(s.graph.showAllBranches).toBe(false);
      expect(s.graph.logOrder).toBe(DEFAULT_REPO_SETTINGS.graph.logOrder);
      expect(s.columns.graph).toBe(123);
      expect(s.columns.desc).toBe(DEFAULT_REPO_SETTINGS.columns.desc);
      expect(s.path).toBe(REPO);
    });

    it('persists graph.logOrder alongside showAllBranches', () => {
      const filePath = settingsFilePath(REPO);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          schemaVersion: 1,
          graph: { showAllBranches: true, logOrder: 'topo' },
        }),
      );
      _resetRepoSettingsState();
      configureRepoSettings(tmpDir);

      const s = loadRepoSettings(REPO);
      expect(s.graph.logOrder).toBe('topo');
      expect(s.graph.showAllBranches).toBe(true);
    });

    it('falls back to defaults when file contains invalid JSON', () => {
      const filePath = settingsFilePath(REPO);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '{not json');
      _resetRepoSettingsState();
      configureRepoSettings(tmpDir);

      const s = loadRepoSettings(REPO);
      expect(s).toEqual({ ...DEFAULT_REPO_SETTINGS, path: REPO });
    });

    it('caches repeated calls (same reference)', () => {
      const a = loadRepoSettings(REPO);
      const b = loadRepoSettings(REPO);
      expect(b).toBe(a);
    });

    it('produces different filenames for different repo paths', () => {
      const a = settingsFilePath('/a/b/c');
      const b = settingsFilePath('/a/b/d');
      expect(a).not.toBe(b);
    });
  });

  describe('updateRepoSettings', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns the merged object synchronously', () => {
      const merged = updateRepoSettings(REPO, {
        columns: { graph: 120 },
      });
      expect(merged.columns.graph).toBe(120);
      expect(merged.columns.desc).toBe(DEFAULT_REPO_SETTINGS.columns.desc);
      expect(merged.path).toBe(REPO);
    });

    it('persists only after the debounce window elapses', () => {
      updateRepoSettings(REPO, { graph: { showAllBranches: false } });
      const filePath = settingsFilePath(REPO);
      expect(fs.existsSync(filePath)).toBe(false);

      vi.advanceTimersByTime(299);
      expect(fs.existsSync(filePath)).toBe(false);

      vi.advanceTimersByTime(1);
      expect(fs.existsSync(filePath)).toBe(true);

      const disk = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(disk.graph.showAllBranches).toBe(false);
    });

    it('coalesces multiple rapid updates into one disk write', () => {
      const writeSpy = vi.spyOn(fs, 'writeFileSync');
      for (let i = 0; i < 10; i++) {
        updateRepoSettings(REPO, { columns: { graph: 60 + i } });
      }
      vi.advanceTimersByTime(300);
      expect(writeSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps path and schemaVersion stable even if patch tries to change them', () => {
      const merged = updateRepoSettings(REPO, {
        path: '/malicious/path',
        schemaVersion: 99,
      } as unknown as Partial<typeof DEFAULT_REPO_SETTINGS>);
      expect(merged.path).toBe(REPO);
      expect(merged.schemaVersion).toBe(2);
    });
  });

  describe('flushRepoSettings', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('forces pending write immediately for the given repo', () => {
      updateRepoSettings(REPO, { graph: { showAllBranches: false } });
      const filePath = settingsFilePath(REPO);
      expect(fs.existsSync(filePath)).toBe(false);
      flushRepoSettings(REPO);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('flushes all pending repos when called without an argument', () => {
      updateRepoSettings('/repo1', { graph: { showAllBranches: false } });
      updateRepoSettings('/repo2', { graph: { showAllBranches: false } });
      flushRepoSettings();
      expect(fs.existsSync(settingsFilePath('/repo1'))).toBe(true);
      expect(fs.existsSync(settingsFilePath('/repo2'))).toBe(true);
    });

    it('is a no-op when there is no pending write', () => {
      flushRepoSettings(REPO);
      expect(fs.existsSync(settingsFilePath(REPO))).toBe(false);
    });
  });
});
