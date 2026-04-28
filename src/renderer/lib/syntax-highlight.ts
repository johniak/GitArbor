/**
 * Cross-component syntax highlighting wrapper. Built on Shiki so token
 * colours come from the same VS Code TextMate themes our palette is
 * modelled on (Dark+ / Light+). Designed reusable from day 1: when the
 * DiffViewer wants colour, it imports `highlightLines` and passes the
 * file path it's diffing.
 *
 * Shiki has a heavy first-load cost (~few MB of grammars), so the
 * highlighter is cached after the first call. `themeStore.resolved`
 * picks which of the two pre-loaded themes is used per render.
 */

import type { BundledLanguage, BundledTheme, Highlighter } from 'shiki';

export type Lang =
  | 'typescript'
  | 'javascript'
  | 'tsx'
  | 'jsx'
  | 'json'
  | 'svelte'
  | 'css'
  | 'html'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'kotlin'
  | 'shellscript'
  | 'yaml'
  | 'markdown'
  | 'plaintext';

const EXT_MAP: Record<string, Lang> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  tsx: 'tsx',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'json',
  svelte: 'svelte',
  css: 'css',
  scss: 'css',
  html: 'html',
  htm: 'html',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
};

const SHIKI_LANGS: BundledLanguage[] = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'json',
  'svelte',
  'css',
  'html',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'shellscript',
  'yaml',
  'markdown',
];

const LIGHT_THEME: BundledTheme = 'light-plus';
const DARK_THEME: BundledTheme = 'dark-plus';
const MAX_HIGHLIGHT_BYTES = 256 * 1024;

/** Map a path's extension to one of our supported langs. */
export function detectLanguage(path: string): Lang {
  const slash = path.lastIndexOf('/');
  const base = slash === -1 ? path : path.slice(slash + 1);
  const dot = base.lastIndexOf('.');
  if (dot === -1) return 'plaintext';
  const ext = base.slice(dot + 1).toLowerCase();
  return EXT_MAP[ext] ?? 'plaintext';
}

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then((m) =>
      m.createHighlighter({
        themes: [LIGHT_THEME, DARK_THEME],
        langs: SHIKI_LANGS,
      }),
    );
  }
  return highlighterPromise;
}

/**
 * Reset the cached highlighter — only used in tests.
 */
export function _resetSyntaxHighlighter(): void {
  highlighterPromise = null;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function plaintextLines(content: string): string[] {
  return content.split('\n').map((line) => `<span>${escapeHtml(line)}</span>`);
}

/**
 * Tokenise `content` for `lang` under `theme` and emit one HTML string
 * per file line. Line count of the output equals `content.split('\n').length`,
 * even when the input ends with a trailing newline.
 *
 * Falls back to plain `<span>`-wrapped escaped lines when:
 * - lang is `plaintext`
 * - file is bigger than `MAX_HIGHLIGHT_BYTES` (Shiki gets slow on very
 *   large files; our use cases here are blame views where 5–10 KB is
 *   the norm).
 */
export async function highlightLines(
  content: string,
  lang: Lang,
  theme: 'light' | 'dark',
): Promise<string[]> {
  if (lang === 'plaintext' || content.length > MAX_HIGHLIGHT_BYTES) {
    return plaintextLines(content);
  }

  const highlighter = await getHighlighter();
  const themeName = theme === 'light' ? LIGHT_THEME : DARK_THEME;

  // Tokenise; Shiki returns one inner array per source line. Trailing
  // newline produces one empty token row which we keep so line count
  // matches `split('\n')`.
  const tokens = highlighter.codeToTokensBase(content, {
    lang: lang as BundledLanguage,
    theme: themeName,
    includeExplanation: false,
  });

  return tokens.map((lineTokens) => {
    if (lineTokens.length === 0) return '<span></span>';
    const inner = lineTokens
      .map(
        (t) =>
          `<span style="color:${t.color ?? 'inherit'}">${escapeHtml(t.content)}</span>`,
      )
      .join('');
    return inner;
  });
}
