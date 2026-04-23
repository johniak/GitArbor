import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COLUMN_WIDTHS,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  STORAGE_KEY,
  clampWidth,
  loadWidths,
  saveWidths,
  setColumnWidth,
  type ColumnWidths,
  type WidthStorage,
} from './column-widths';

function memoryStorage() {
  const map = new Map<string, string>();
  const storage: WidthStorage & { map: Map<string, string> } = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    map,
  };
  return storage;
}

describe('clampWidth', () => {
  it('clamps below MIN to MIN', () => {
    expect(clampWidth(0)).toBe(MIN_COLUMN_WIDTH);
    expect(clampWidth(-50)).toBe(MIN_COLUMN_WIDTH);
  });

  it('clamps above new MAX (1200) to MAX', () => {
    expect(clampWidth(9999)).toBe(MAX_COLUMN_WIDTH);
    expect(clampWidth(MAX_COLUMN_WIDTH + 1)).toBe(MAX_COLUMN_WIDTH);
  });

  it('returns in-range values unchanged (rounded)', () => {
    expect(clampWidth(120)).toBe(120);
    expect(clampWidth(120.4)).toBe(120);
    expect(clampWidth(120.6)).toBe(121);
  });

  it('falls back to MIN for non-finite input', () => {
    expect(clampWidth(Number.NaN)).toBe(MIN_COLUMN_WIDTH);
    expect(clampWidth(Number.POSITIVE_INFINITY)).toBe(MIN_COLUMN_WIDTH);
  });
});

describe('setColumnWidth', () => {
  const base: ColumnWidths = {
    graph: 60,
    desc: 400,
    hash: 80,
    author: 100,
    date: 100,
  };

  it('sets the target column to the given value', () => {
    expect(setColumnWidth(base, 'desc', 550)).toEqual({
      graph: 60,
      desc: 550,
      hash: 80,
      author: 100,
      date: 100,
    });
  });

  it('clamps to MIN when value is below', () => {
    expect(setColumnWidth(base, 'hash', 10)).toEqual({
      ...base,
      hash: MIN_COLUMN_WIDTH,
    });
  });

  it('clamps to MAX when value is above', () => {
    expect(setColumnWidth(base, 'date', 9999)).toEqual({
      ...base,
      date: MAX_COLUMN_WIDTH,
    });
  });

  it('leaves the other four columns untouched', () => {
    const next = setColumnWidth(base, 'author', 200);
    expect(next.graph).toBe(base.graph);
    expect(next.desc).toBe(base.desc);
    expect(next.hash).toBe(base.hash);
    expect(next.date).toBe(base.date);
    expect(next.author).toBe(200);
  });

  it('returns a new object and does not mutate the input', () => {
    const before = { ...base };
    const next = setColumnWidth(base, 'graph', 150);
    expect(base).toEqual(before);
    expect(next).not.toBe(base);
  });
});

describe('loadWidths', () => {
  it('returns defaults (5 keys) when storage is empty', () => {
    const storage = memoryStorage();
    expect(loadWidths(storage)).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(Object.keys(loadWidths(storage))).toHaveLength(5);
  });

  it('returns defaults on invalid JSON', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(loadWidths(storage)).toEqual(DEFAULT_COLUMN_WIDTHS);
  });

  it('returns defaults when parsed value is not an object', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '42');
    expect(loadWidths(storage)).toEqual(DEFAULT_COLUMN_WIDTHS);
  });

  it('fills missing keys with defaults', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ hash: 150 }));
    expect(loadWidths(storage)).toEqual({
      ...DEFAULT_COLUMN_WIDTHS,
      hash: 150,
    });
  });

  it('clamps stored values that are out of range (per key)', () => {
    const storage = memoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        graph: 9999,
        desc: 5,
        hash: 150,
        author: -20,
        date: 2000,
      }),
    );
    expect(loadWidths(storage)).toEqual({
      graph: MAX_COLUMN_WIDTH,
      desc: MIN_COLUMN_WIDTH,
      hash: 150,
      author: MIN_COLUMN_WIDTH,
      date: MAX_COLUMN_WIDTH,
    });
  });

  it('ignores non-numeric values and uses defaults for them', () => {
    const storage = memoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        graph: 'oops',
        desc: null,
        hash: 95,
        author: false,
        date: undefined,
      }),
    );
    expect(loadWidths(storage)).toEqual({
      graph: DEFAULT_COLUMN_WIDTHS.graph,
      desc: DEFAULT_COLUMN_WIDTHS.desc,
      hash: 95,
      author: DEFAULT_COLUMN_WIDTHS.author,
      date: DEFAULT_COLUMN_WIDTHS.date,
    });
  });

  it('returns a valid 5-key stored object as-is', () => {
    const storage = memoryStorage();
    const stored: ColumnWidths = {
      graph: 150,
      desc: 500,
      hash: 90,
      author: 120,
      date: 140,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(stored));
    expect(loadWidths(storage)).toEqual(stored);
  });
});

describe('saveWidths', () => {
  it('writes JSON with all 5 keys under the storage key', () => {
    const storage = memoryStorage();
    const widths: ColumnWidths = {
      graph: 70,
      desc: 450,
      hash: 90,
      author: 120,
      date: 140,
    };
    saveWidths(storage, widths);
    const raw = storage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as ColumnWidths;
    expect(parsed).toEqual(widths);
    expect(Object.keys(parsed).sort()).toEqual([
      'author',
      'date',
      'desc',
      'graph',
      'hash',
    ]);
  });

  it('round-trips through save+load', () => {
    const storage = memoryStorage();
    const widths: ColumnWidths = {
      graph: 111,
      desc: 222,
      hash: 99,
      author: 77,
      date: 55,
    };
    saveWidths(storage, widths);
    expect(loadWidths(storage)).toEqual(widths);
  });
});
