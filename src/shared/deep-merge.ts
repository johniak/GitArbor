export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export const SETTINGS_DEBOUNCE_MS = 300;

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge `patch` into `base`. Structurally shared: if a sub-object's merge
 * produces nothing new, the original reference is reused. If the top-level
 * merge is a no-op (all values already equal), returns `base` itself so
 * callers can compare references to detect "nothing actually changed".
 */
export function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    if (patch === undefined) return base;
    return Object.is(base, patch) ? base : (patch as T);
  }
  let mutated = false;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = (base as Record<string, unknown>)[key];
    if (isPlainObject(value) && isPlainObject(current)) {
      const merged = deepMerge(current, value as DeepPartial<typeof current>);
      if (merged !== current) {
        out[key] = merged;
        mutated = true;
      }
    } else if (!Object.is(current, value)) {
      out[key] = value;
      mutated = true;
    }
  }
  return mutated ? (out as T) : base;
}
