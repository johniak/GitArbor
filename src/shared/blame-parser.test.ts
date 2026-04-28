import { describe, it, expect } from 'vitest';
import { parseBlamePorcelain } from './blame-parser';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function porcelain(blocks: string[]): string {
  return blocks.join('\n');
}

function authorBlock(opts: {
  sha: string;
  origLine: number;
  finalLine: number;
  numLines?: number;
  authorName?: string;
  authorEmail?: string;
  authorTime?: number;
  authorTz?: string;
  content: string;
}): string {
  const header =
    opts.numLines !== undefined
      ? `${opts.sha} ${opts.origLine} ${opts.finalLine} ${opts.numLines}`
      : `${opts.sha} ${opts.origLine} ${opts.finalLine}`;
  const lines = [header];
  if (opts.authorName !== undefined) lines.push(`author ${opts.authorName}`);
  if (opts.authorEmail !== undefined) {
    lines.push(`author-mail <${opts.authorEmail}>`);
  }
  if (opts.authorTime !== undefined) {
    lines.push(`author-time ${opts.authorTime}`);
  }
  if (opts.authorTz !== undefined) lines.push(`author-tz ${opts.authorTz}`);
  lines.push(`\t${opts.content}`);
  return lines.join('\n');
}

function followUp(
  sha: string,
  origLine: number,
  finalLine: number,
  content: string,
): string {
  return `${sha} ${origLine} ${finalLine}\n\t${content}`;
}

describe('parseBlamePorcelain', () => {
  it('returns [] for empty input', () => {
    expect(parseBlamePorcelain('')).toEqual([]);
  });

  it('parses a single-author single-line file', () => {
    const raw = porcelain([
      authorBlock({
        sha: SHA_A,
        origLine: 1,
        finalLine: 1,
        numLines: 1,
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
        authorTime: 1700000000,
        authorTz: '+0200',
        content: 'first line',
      }),
    ]);
    const lines = parseBlamePorcelain(raw);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      hash: SHA_A,
      hashShort: 'aaaaaaa',
      authorName: 'Alice',
      authorEmail: 'alice@example.com',
      lineNumber: 1,
      content: 'first line',
    });
    // ISO date includes the +02:00 offset
    expect(lines[0].date).toMatch(/T.*\+02:00$/);
  });

  it('handles sha-group header omission for follow-up lines', () => {
    const raw = porcelain([
      authorBlock({
        sha: SHA_A,
        origLine: 1,
        finalLine: 1,
        numLines: 3,
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
        authorTime: 1700000000,
        authorTz: '+0000',
        content: 'line one',
      }),
      followUp(SHA_A, 2, 2, 'line two'),
      followUp(SHA_A, 3, 3, 'line three'),
    ]);
    const lines = parseBlamePorcelain(raw);
    expect(lines.map((l) => l.content)).toEqual([
      'line one',
      'line two',
      'line three',
    ]);
    // All three rows keep the same author info.
    expect(new Set(lines.map((l) => l.authorName))).toEqual(new Set(['Alice']));
  });

  it('parses a multi-author file', () => {
    const raw = porcelain([
      authorBlock({
        sha: SHA_A,
        origLine: 1,
        finalLine: 1,
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
        authorTime: 1700000000,
        authorTz: '+0000',
        content: 'alice line',
      }),
      authorBlock({
        sha: SHA_B,
        origLine: 1,
        finalLine: 2,
        authorName: 'Bob',
        authorEmail: 'bob@example.com',
        authorTime: 1700001000,
        authorTz: '+0000',
        content: 'bob line',
      }),
    ]);
    const lines = parseBlamePorcelain(raw);
    expect(lines.map((l) => [l.hashShort, l.authorName])).toEqual([
      ['aaaaaaa', 'Alice'],
      ['bbbbbbb', 'Bob'],
    ]);
  });

  it('preserves tabs and unicode in content', () => {
    const raw = porcelain([
      authorBlock({
        sha: SHA_A,
        origLine: 1,
        finalLine: 1,
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
        authorTime: 1700000000,
        authorTz: '+0000',
        content: 'pre\tafter — łąka',
      }),
    ]);
    const lines = parseBlamePorcelain(raw);
    expect(lines[0].content).toBe('pre\tafter — łąka');
  });

  it('preserves leading whitespace in content', () => {
    const raw = porcelain([
      authorBlock({
        sha: SHA_A,
        origLine: 1,
        finalLine: 1,
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
        authorTime: 1700000000,
        authorTz: '+0000',
        content: '    indented',
      }),
    ]);
    expect(parseBlamePorcelain(raw)[0].content).toBe('    indented');
  });

  it('returns [] for malformed input rather than throwing', () => {
    const raw = 'not a valid porcelain dump\nwith two lines';
    expect(parseBlamePorcelain(raw)).toEqual([]);
  });

  it('orders rows by final line number even if input is shuffled', () => {
    const raw = porcelain([
      authorBlock({
        sha: SHA_A,
        origLine: 1,
        finalLine: 3,
        authorName: 'Alice',
        authorEmail: 'a@x',
        authorTime: 1,
        authorTz: '+0000',
        content: 'line three',
      }),
      authorBlock({
        sha: SHA_B,
        origLine: 1,
        finalLine: 1,
        authorName: 'Bob',
        authorEmail: 'b@x',
        authorTime: 1,
        authorTz: '+0000',
        content: 'line one',
      }),
    ]);
    const lines = parseBlamePorcelain(raw);
    expect(lines.map((l) => l.lineNumber)).toEqual([1, 3]);
  });

  it('handles the all-zeros sha (uncommitted lines)', () => {
    const ZERO = '0'.repeat(40);
    const raw = porcelain([
      authorBlock({
        sha: ZERO,
        origLine: 1,
        finalLine: 1,
        authorName: 'Not Committed Yet',
        authorEmail: 'not.committed.yet',
        authorTime: 1700000000,
        authorTz: '+0000',
        content: 'WIP',
      }),
    ]);
    const lines = parseBlamePorcelain(raw);
    expect(lines[0].hash).toBe(ZERO);
    expect(lines[0].hashShort).toBe('0000000');
    expect(lines[0].authorName).toBe('Not Committed Yet');
  });
});
