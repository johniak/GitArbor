import { describe, it, expect, vi, afterEach } from 'vitest';
import { relativeDate } from './date-utils';

describe('relativeDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function mockNow(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  }

  it('returns "just now" for < 60 seconds ago', () => {
    mockNow('2026-04-09T12:01:00Z');
    expect(relativeDate('2026-04-09T12:00:30Z')).toBe('just now');
  });

  it('returns minutes ago', () => {
    mockNow('2026-04-09T12:05:00Z');
    expect(relativeDate('2026-04-09T12:00:00Z')).toBe('5 minutes ago');
  });

  it('returns "1 minute ago" singular', () => {
    mockNow('2026-04-09T12:01:00Z');
    expect(relativeDate('2026-04-09T12:00:00Z')).toBe('1 minute ago');
  });

  it('returns hours ago', () => {
    mockNow('2026-04-09T15:00:00Z');
    expect(relativeDate('2026-04-09T12:00:00Z')).toBe('3 hours ago');
  });

  it('returns "1 hour ago" singular', () => {
    mockNow('2026-04-09T13:00:00Z');
    expect(relativeDate('2026-04-09T12:00:00Z')).toBe('1 hour ago');
  });

  it('returns days ago', () => {
    mockNow('2026-04-12T12:00:00Z');
    expect(relativeDate('2026-04-09T12:00:00Z')).toBe('3 days ago');
  });

  it('returns months ago', () => {
    mockNow('2026-07-09T12:00:00Z');
    expect(relativeDate('2026-04-09T12:00:00Z')).toBe('3 months ago');
  });

  it('returns years ago', () => {
    mockNow('2028-04-09T12:00:00Z');
    expect(relativeDate('2026-04-09T12:00:00Z')).toBe('2 years ago');
  });

  it('returns "just now" for future dates', () => {
    mockNow('2026-04-09T12:00:00Z');
    expect(relativeDate('2026-04-09T13:00:00Z')).toBe('just now');
  });
});
