import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock electron's nativeTheme — Vitest hoists vi.mock above imports.
vi.mock('electron', () => {
  const listeners: Array<() => void> = [];
  return {
    nativeTheme: {
      themeSource: 'system' as 'system' | 'light' | 'dark',
      shouldUseDarkColors: true,
      on(event: string, listener: () => void) {
        if (event === 'updated') listeners.push(listener);
      },
      off(event: string, listener: () => void) {
        if (event !== 'updated') return;
        const i = listeners.indexOf(listener);
        if (i >= 0) listeners.splice(i, 1);
      },
      __emitUpdated() {
        for (const l of [...listeners]) l();
      },
      __reset() {
        listeners.length = 0;
        this.themeSource = 'system';
        this.shouldUseDarkColors = true;
      },
    },
  };
});

import { nativeTheme } from 'electron';
import {
  applyAppearance,
  getResolvedTheme,
  onResolvedThemeChange,
} from './theme';

interface MockTheme {
  themeSource: 'system' | 'light' | 'dark';
  shouldUseDarkColors: boolean;
  __emitUpdated: () => void;
  __reset: () => void;
}

const mockTheme = nativeTheme as unknown as MockTheme;

beforeEach(() => {
  mockTheme.__reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyAppearance', () => {
  it('sets themeSource to system', () => {
    applyAppearance('system');
    expect(mockTheme.themeSource).toBe('system');
  });

  it('sets themeSource to light', () => {
    applyAppearance('light');
    expect(mockTheme.themeSource).toBe('light');
  });

  it('sets themeSource to dark', () => {
    applyAppearance('dark');
    expect(mockTheme.themeSource).toBe('dark');
  });
});

describe('getResolvedTheme', () => {
  it("returns 'dark' when shouldUseDarkColors is true", () => {
    mockTheme.shouldUseDarkColors = true;
    expect(getResolvedTheme()).toBe('dark');
  });

  it("returns 'light' when shouldUseDarkColors is false", () => {
    mockTheme.shouldUseDarkColors = false;
    expect(getResolvedTheme()).toBe('light');
  });
});

describe('onResolvedThemeChange', () => {
  it('invokes the callback on updated event with current resolved theme', () => {
    const calls: string[] = [];
    const off = onResolvedThemeChange((t) => calls.push(t));

    mockTheme.shouldUseDarkColors = false;
    mockTheme.__emitUpdated();
    mockTheme.shouldUseDarkColors = true;
    mockTheme.__emitUpdated();

    expect(calls).toEqual(['light', 'dark']);
    off();
  });

  it('returns an unsubscribe function that detaches the listener', () => {
    const calls: string[] = [];
    const off = onResolvedThemeChange((t) => calls.push(t));
    off();
    mockTheme.__emitUpdated();
    expect(calls).toEqual([]);
  });
});
