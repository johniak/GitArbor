import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectLanguage,
  highlightLines,
  _resetSyntaxHighlighter,
} from './syntax-highlight';

beforeEach(() => {
  _resetSyntaxHighlighter();
  vi.restoreAllMocks();
});

describe('detectLanguage', () => {
  it.each([
    ['src/foo.ts', 'typescript'],
    ['src/foo.tsx', 'tsx'],
    ['src/foo.js', 'javascript'],
    ['src/foo.jsx', 'jsx'],
    ['data.json', 'json'],
    ['app.svelte', 'svelte'],
    ['style.css', 'css'],
    ['style.scss', 'css'],
    ['index.html', 'html'],
    ['snake.py', 'python'],
    ['main.go', 'go'],
    ['lib.rs', 'rust'],
    ['Foo.java', 'java'],
    ['Foo.kt', 'kotlin'],
    ['run.sh', 'shellscript'],
    ['ci.yaml', 'yaml'],
    ['ci.yml', 'yaml'],
    ['README.md', 'markdown'],
  ])('maps %s to %s', (path, expected) => {
    expect(detectLanguage(path)).toBe(expected);
  });

  it('returns plaintext for unknown extensions', () => {
    expect(detectLanguage('foo.xyz')).toBe('plaintext');
    expect(detectLanguage('foo')).toBe('plaintext');
    expect(detectLanguage('Dockerfile')).toBe('plaintext');
  });

  it('handles deeply nested paths', () => {
    expect(detectLanguage('src/main/very/deep/file.ts')).toBe('typescript');
  });

  it('is case-insensitive on extensions', () => {
    expect(detectLanguage('FOO.TS')).toBe('typescript');
  });
});

describe('highlightLines (plaintext path)', () => {
  it('returns one HTML span per source line', async () => {
    const result = await highlightLines('foo\nbar\nbaz', 'plaintext', 'dark');
    expect(result).toEqual([
      '<span>foo</span>',
      '<span>bar</span>',
      '<span>baz</span>',
    ]);
  });

  it('preserves a trailing-newline-induced empty line', async () => {
    const result = await highlightLines('a\nb\n', 'plaintext', 'dark');
    expect(result).toHaveLength(3);
    expect(result[2]).toBe('<span></span>');
  });

  it('escapes HTML-significant characters in plain content', async () => {
    const result = await highlightLines(
      '<script>"\'</script> & <',
      'plaintext',
      'dark',
    );
    expect(result[0]).toBe(
      '<span>&lt;script&gt;&quot;&#39;&lt;/script&gt; &amp; &lt;</span>',
    );
  });

  it('falls back to plaintext when content exceeds size cap', async () => {
    // 257 KB content — exceeds MAX_HIGHLIGHT_BYTES (256 KB).
    const big = 'a'.repeat(257 * 1024);
    const result = await highlightLines(big, 'typescript', 'dark');
    expect(result).toHaveLength(1);
    expect(result[0].startsWith('<span>')).toBe(true);
  });
});

describe('highlightLines (Shiki path, mocked)', () => {
  it('caches the highlighter across calls', async () => {
    const codeToTokensBase = vi
      .fn()
      .mockReturnValue([[{ content: 'function', color: '#569cd6' }]]);
    const createHighlighter = vi.fn().mockResolvedValue({ codeToTokensBase });

    vi.doMock('shiki', () => ({ createHighlighter }));

    await highlightLines('function', 'typescript', 'dark');
    await highlightLines('function', 'typescript', 'light');
    await highlightLines('function', 'javascript', 'dark');

    // Highlighter created exactly once despite three calls and two themes.
    expect(createHighlighter).toHaveBeenCalledTimes(1);
    expect(codeToTokensBase).toHaveBeenCalledTimes(3);

    vi.doUnmock('shiki');
  });

  it('returns one span block per source line and escapes content', async () => {
    const codeToTokensBase = vi.fn().mockReturnValue([
      [{ content: 'const ', color: '#569cd6' }],
      [
        { content: 'foo ', color: '#9cdcfe' },
        { content: '= ', color: '#cccccc' },
        { content: '"<bar>"', color: '#ce9178' },
      ],
    ]);
    vi.doMock('shiki', () => ({
      createHighlighter: vi.fn().mockResolvedValue({ codeToTokensBase }),
    }));

    const lines = await highlightLines(
      'const\nfoo = "<bar>"',
      'typescript',
      'dark',
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('<span style="color:#569cd6">const </span>');
    // String token had `<` `>` — must be escaped.
    expect(lines[1]).toContain('&quot;&lt;bar&gt;&quot;');

    vi.doUnmock('shiki');
  });

  it('renders empty Shiki line as <span></span>', async () => {
    const codeToTokensBase = vi.fn().mockReturnValue([[], []]);
    vi.doMock('shiki', () => ({
      createHighlighter: vi.fn().mockResolvedValue({ codeToTokensBase }),
    }));

    const lines = await highlightLines('\n', 'typescript', 'dark');
    expect(lines).toEqual(['<span></span>', '<span></span>']);

    vi.doUnmock('shiki');
  });
});
