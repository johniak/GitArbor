import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  _resetAppSettingsState,
  configureAppSettings,
  loadAppSettings,
  updateAppSettings,
  flushAppSettings,
} from './app-settings';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
} from '../shared/app-settings-types';

const FILE_NAME = 'app-settings.json';

describe('app-settings (schema v3 + ai)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arbor-app-settings-'));
    _resetAppSettingsState();
    configureAppSettings(tmpDir);
  });

  afterEach(() => {
    _resetAppSettingsState();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads defaults including ai.enabled=false when no file exists', () => {
    const s = loadAppSettings();
    expect(s).toEqual(DEFAULT_APP_SETTINGS);
    expect(s.schemaVersion).toBe(3);
    expect(s.ai.enabled).toBe(false);
    expect(s.ai.downloadedModels).toEqual({});
  });

  it('upgrades a v2 file (no ai key) to v3 via deep-merge', () => {
    fs.writeFileSync(
      path.join(tmpDir, FILE_NAME),
      JSON.stringify({
        schemaVersion: 2,
        general: { authorName: 'Old User', authorEmail: '' },
      }),
    );
    _resetAppSettingsState();
    configureAppSettings(tmpDir);

    const s = loadAppSettings();
    expect(s.general.authorName).toBe('Old User');
    expect(s.ai).toBeDefined();
    expect(s.ai.enabled).toBe(false);
    expect(s.ai.selectedModelId).toBe(DEFAULT_APP_SETTINGS.ai.selectedModelId);
  });

  it('updating ai.selectedModelId does not clobber general fields', () => {
    updateAppSettings({ general: { authorName: 'Alice' } });
    const next = updateAppSettings({
      ai: { selectedModelId: 'qwen-2.5-coder-3b-q4' },
    });
    expect(next.general.authorName).toBe('Alice');
    expect(next.ai.selectedModelId).toBe('qwen-2.5-coder-3b-q4');
    expect(next.schemaVersion).toBe(3);
  });

  it('persists ai changes to disk', () => {
    updateAppSettings({
      ai: {
        enabled: true,
        downloadedModels: {
          'qwen-2.5-coder-1.5b-q4': {
            id: 'qwen-2.5-coder-1.5b-q4',
            filename: 'qwen-2.5-coder-1.5b-q4.gguf',
            sizeBytes: 999,
            sourceUrl: 'https://example.com/m.gguf',
            downloadedAt: 1,
            isCustom: false,
            label: 'Qwen 2.5 Coder 1.5B',
            contextWindow: 32768,
          },
        },
      },
    });
    flushAppSettings();
    const raw = fs.readFileSync(path.join(tmpDir, FILE_NAME), 'utf-8');
    const parsed: AppSettings = JSON.parse(raw);
    expect(parsed.ai.enabled).toBe(true);
    expect(parsed.ai.downloadedModels['qwen-2.5-coder-1.5b-q4'].sizeBytes).toBe(
      999,
    );
  });
});
