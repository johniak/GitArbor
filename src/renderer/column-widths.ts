export type ColumnKey = 'graph' | 'desc' | 'hash' | 'author' | 'date';
export type ColumnWidths = Record<ColumnKey, number>;

export const MIN_COLUMN_WIDTH = 40;
export const MAX_COLUMN_WIDTH = 1200;

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  graph: 60,
  desc: 400,
  hash: 80,
  author: 100,
  date: 100,
};

export const COLUMN_KEYS = ['graph', 'desc', 'hash', 'author', 'date'] as const;

export const STORAGE_KEY = 'gitArbor.commitLogColumnWidths';

export interface WidthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function clampWidth(w: number): number {
  if (!Number.isFinite(w)) return MIN_COLUMN_WIDTH;
  return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(w)));
}

export function setColumnWidth(
  widths: ColumnWidths,
  column: ColumnKey,
  width: number,
): ColumnWidths {
  return { ...widths, [column]: clampWidth(width) };
}

export function loadWidths(storage: WidthStorage): ColumnWidths {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw == null) return { ...DEFAULT_COLUMN_WIDTHS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_COLUMN_WIDTHS };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ...DEFAULT_COLUMN_WIDTHS };
  }

  const source = parsed as Partial<Record<ColumnKey, unknown>>;
  const result: ColumnWidths = { ...DEFAULT_COLUMN_WIDTHS };
  for (const key of COLUMN_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = clampWidth(value);
    }
  }
  return result;
}

export function saveWidths(storage: WidthStorage, widths: ColumnWidths): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(widths));
}
