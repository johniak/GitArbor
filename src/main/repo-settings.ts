import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  DEFAULT_REPO_SETTINGS,
  type RepoSettings,
} from '../shared/repo-settings-types';
import {
  deepMerge,
  isPlainObject,
  SETTINGS_DEBOUNCE_MS,
  type DeepPartial,
} from '../shared/deep-merge';

const SETTINGS_DIR = 'repo-settings';

let userDataDir: string | null = null;
const cache = new Map<string, RepoSettings>();
const pendingTimers = new Map<string, NodeJS.Timeout>();

export function configureRepoSettings(dir: string): void {
  userDataDir = dir;
}

function requireDir(): string {
  if (!userDataDir) {
    throw new Error(
      'repo-settings: configureRepoSettings(dir) must be called first',
    );
  }
  return userDataDir;
}

export function settingsFilePath(repoPath: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(repoPath)
    .digest('hex')
    .slice(0, 16);
  return path.join(requireDir(), SETTINGS_DIR, `${hash}.json`);
}

function readFromDisk(repoPath: string): RepoSettings {
  const filePath = settingsFilePath(repoPath);
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_REPO_SETTINGS, path: repoPath };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return { ...DEFAULT_REPO_SETTINGS, path: repoPath };
  }
  if (!isPlainObject(parsed)) {
    return { ...DEFAULT_REPO_SETTINGS, path: repoPath };
  }
  const merged = deepMerge(
    DEFAULT_REPO_SETTINGS,
    parsed as DeepPartial<RepoSettings>,
  );
  return { ...merged, path: repoPath };
}

export function loadRepoSettings(repoPath: string): RepoSettings {
  const cached = cache.get(repoPath);
  if (cached) return cached;
  const settings = readFromDisk(repoPath);
  cache.set(repoPath, settings);
  return settings;
}

function writeToDisk(repoPath: string): void {
  const settings = cache.get(repoPath);
  if (!settings) return;
  const filePath = settingsFilePath(repoPath);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
  pendingTimers.delete(repoPath);
}

export function updateRepoSettings(
  repoPath: string,
  patch: DeepPartial<RepoSettings>,
): RepoSettings {
  const current = loadRepoSettings(repoPath);
  const merged: RepoSettings = {
    ...deepMerge(current, patch),
    path: repoPath,
    schemaVersion: 1,
  };
  cache.set(repoPath, merged);

  const existing = pendingTimers.get(repoPath);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    repoPath,
    setTimeout(() => writeToDisk(repoPath), SETTINGS_DEBOUNCE_MS),
  );
  return merged;
}

export function flushRepoSettings(repoPath?: string): void {
  if (repoPath) {
    const timer = pendingTimers.get(repoPath);
    if (!timer) return;
    clearTimeout(timer);
    writeToDisk(repoPath);
    return;
  }
  for (const [p, timer] of pendingTimers) {
    clearTimeout(timer);
    writeToDisk(p);
  }
}

/** Testing hook — resets in-memory state. */
export function _resetRepoSettingsState(): void {
  for (const timer of pendingTimers.values()) clearTimeout(timer);
  pendingTimers.clear();
  cache.clear();
  userDataDir = null;
}
