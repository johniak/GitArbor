import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
} from '../shared/app-settings-types';
import {
  deepMerge,
  isPlainObject,
  SETTINGS_DEBOUNCE_MS,
  type DeepPartial,
} from '../shared/deep-merge';

const FILE_NAME = 'app-settings.json';

let userDataDir: string | null = null;
let cache: AppSettings | null = null;
let pendingTimer: NodeJS.Timeout | null = null;

export function configureAppSettings(dir: string): void {
  userDataDir = dir;
}

function requireDir(): string {
  if (!userDataDir) {
    throw new Error(
      'app-settings: configureAppSettings(dir) must be called first',
    );
  }
  return userDataDir;
}

function settingsFilePath(): string {
  return path.join(requireDir(), FILE_NAME);
}

function readFromDisk(): AppSettings {
  const filePath = settingsFilePath();
  if (!fs.existsSync(filePath)) return { ...DEFAULT_APP_SETTINGS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
  if (!isPlainObject(parsed)) return { ...DEFAULT_APP_SETTINGS };
  return deepMerge(DEFAULT_APP_SETTINGS, parsed as DeepPartial<AppSettings>);
}

export function loadAppSettings(): AppSettings {
  if (cache) return cache;
  cache = readFromDisk();
  return cache;
}

function writeToDisk(): void {
  if (!cache) return;
  const filePath = settingsFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
  pendingTimer = null;
}

export function updateAppSettings(
  patch: DeepPartial<AppSettings>,
): AppSettings {
  const current = loadAppSettings();
  const merged: AppSettings = {
    ...deepMerge(current, patch),
    schemaVersion: 1,
  };
  cache = merged;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(writeToDisk, SETTINGS_DEBOUNCE_MS);
  return merged;
}

export function flushAppSettings(): void {
  if (!pendingTimer) return;
  clearTimeout(pendingTimer);
  writeToDisk();
}
