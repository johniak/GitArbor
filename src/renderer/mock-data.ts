import type { SidebarData, Commit, ChangedFile, FileDiff } from './types';

export const mockSidebar: SidebarData = {
  branches: [
    {
      name: 'main',
      current: true,
      commit: 'ac778d7',
      tracking: 'origin/main',
      ahead: 0,
      behind: 0,
    },
    {
      name: 'develop',
      current: false,
      commit: 'd6012eb',
      tracking: 'origin/develop',
      ahead: 2,
      behind: 0,
    },
    {
      name: 'feature/ui-layout',
      current: false,
      commit: 'd27c043',
      tracking: null,
      ahead: 0,
      behind: 0,
    },
    {
      name: 'feature/splitters',
      current: false,
      commit: 'ce574fb',
      tracking: null,
      ahead: 0,
      behind: 0,
    },
  ],
  tags: [{ name: 'v0.1.0' }],
  remotes: [{ name: 'origin', branches: ['main', 'develop'] }],
  stashes: [],
};

// Helper to create consistent mock hashes
function h(short: string): string {
  return short.padEnd(40, '0');
}

/**
 * Rich mock commit history with branching and merging:
 *
 *   a1 ─ a2 ─ a3 ─── M1 ─ a4 ─── M2 ─ a5   (main)
 *              \      /            /
 *               b1 ─ b2          /   (feature/ui)
 *                    \          /
 *                     c1 ─ c2 ─ c3            (feature/api)
 */
export const mockCommits: Commit[] = [
  // HEAD — latest on main
  {
    hash: h('a5a5a5a'),
    hashShort: 'a5a5a5a',
    message: 'feat: add ESLint, Prettier, and tsc typecheck',
    authorName: 'johniak',
    authorEmail: 'john@example.com',
    date: '2026-04-09T14:00:00Z',
    dateRelative: '1 hour ago',
    parents: [h('m2m2m2m')],
    refs: ['HEAD -> main', 'origin/main'],
  },
  // Merge feature/api into main
  {
    hash: h('m2m2m2m'),
    hashShort: 'm2m2m2m',
    message: "Merge branch 'feature/api' into main",
    authorName: 'johniak',
    authorEmail: 'john@example.com',
    date: '2026-04-09T13:30:00Z',
    dateRelative: '1.5 hours ago',
    parents: [h('a4a4a4a'), h('c3c3c3c')],
    refs: [],
  },
  // feature/api branch — c3
  {
    hash: h('c3c3c3c'),
    hashShort: 'c3c3c3c',
    message: 'feat: add API authentication middleware',
    authorName: 'marek',
    authorEmail: 'marek@example.com',
    date: '2026-04-09T13:00:00Z',
    dateRelative: '2 hours ago',
    parents: [h('c2c2c2c')],
    refs: ['feature/api'],
  },
  // main continues — a4
  {
    hash: h('a4a4a4a'),
    hashShort: 'a4a4a4a',
    message: 'fix: correct main entry path',
    authorName: 'johniak',
    authorEmail: 'john@example.com',
    date: '2026-04-09T12:30:00Z',
    dateRelative: '2.5 hours ago',
    parents: [h('m1m1m1m')],
    refs: [],
  },
  // feature/api — c2
  {
    hash: h('c2c2c2c'),
    hashShort: 'c2c2c2c',
    message: 'feat: add REST endpoints',
    authorName: 'marek',
    authorEmail: 'marek@example.com',
    date: '2026-04-09T12:00:00Z',
    dateRelative: '3 hours ago',
    parents: [h('c1c1c1c')],
    refs: [],
  },
  // Merge feature/ui into main
  {
    hash: h('m1m1m1m'),
    hashShort: 'm1m1m1m',
    message: "Merge branch 'feature/ui' into main",
    authorName: 'johniak',
    authorEmail: 'john@example.com',
    date: '2026-04-09T11:30:00Z',
    dateRelative: '3.5 hours ago',
    parents: [h('a3a3a3a'), h('b2b2b2b')],
    refs: [],
  },
  // feature/ui — b2
  {
    hash: h('b2b2b2b'),
    hashShort: 'b2b2b2b',
    message: 'feat: add dark mode theme',
    authorName: 'anna',
    authorEmail: 'anna@example.com',
    date: '2026-04-09T11:00:00Z',
    dateRelative: '4 hours ago',
    parents: [h('b1b1b1b')],
    refs: [],
  },
  // feature/api — c1 (forked from b2)
  {
    hash: h('c1c1c1c'),
    hashShort: 'c1c1c1c',
    message: 'feat: setup API routes',
    authorName: 'marek',
    authorEmail: 'marek@example.com',
    date: '2026-04-09T11:00:00Z',
    dateRelative: '4 hours ago',
    parents: [h('b2b2b2b')],
    refs: [],
  },
  // feature/ui — b1
  {
    hash: h('b1b1b1b'),
    hashShort: 'b1b1b1b',
    message: 'feat: add sidebar component',
    authorName: 'anna',
    authorEmail: 'anna@example.com',
    date: '2026-04-09T10:00:00Z',
    dateRelative: '5 hours ago',
    parents: [h('a3a3a3a')],
    refs: [],
  },
  // main — a3 (fork point)
  {
    hash: h('a3a3a3a'),
    hashShort: 'a3a3a3a',
    message: 'chore: add Forge and Vite configuration',
    authorName: 'johniak',
    authorEmail: 'john@example.com',
    date: '2026-04-09T09:00:00Z',
    dateRelative: '6 hours ago',
    parents: [h('a2a2a2a')],
    refs: [],
  },
  // main — a2
  {
    hash: h('a2a2a2a'),
    hashShort: 'a2a2a2a',
    message: 'chore: add TypeScript config',
    authorName: 'johniak',
    authorEmail: 'john@example.com',
    date: '2026-04-09T08:00:00Z',
    dateRelative: '7 hours ago',
    parents: [h('a1a1a1a')],
    refs: [],
  },
  // main — a1 (root)
  {
    hash: h('a1a1a1a'),
    hashShort: 'a1a1a1a',
    message: 'chore: initialize project',
    authorName: 'johniak',
    authorEmail: 'john@example.com',
    date: '2026-04-09T07:00:00Z',
    dateRelative: '8 hours ago',
    parents: [],
    refs: ['tag: v0.1.0'],
  },
];

export const mockFiles: ChangedFile[] = [
  { path: 'eslint.config.mjs', status: 'M', insertions: 12, deletions: 2 },
  { path: '.prettierrc', status: 'A', insertions: 6, deletions: 0 },
  { path: '.prettierignore', status: 'A', insertions: 5, deletions: 0 },
  { path: 'package.json', status: 'M', insertions: 4, deletions: 1 },
  {
    path: '.github/workflows/test.yml',
    status: 'M',
    insertions: 15,
    deletions: 0,
  },
];

export const mockDiff: FileDiff = {
  path: 'eslint.config.mjs',
  status: 'M',
  binary: false,
  hunks: [
    {
      header: '@@ -1,5 +1,7 @@',
      lines: [
        {
          oldLine: 1,
          newLine: 1,
          type: 'context',
          content: "import js from '@eslint/js';",
        },
        {
          oldLine: 2,
          newLine: 2,
          type: 'context',
          content: "import ts from 'typescript-eslint';",
        },
        {
          oldLine: 3,
          newLine: 3,
          type: 'context',
          content: "import svelte from 'eslint-plugin-svelte';",
        },
        {
          oldLine: null,
          newLine: 4,
          type: 'added',
          content: "import prettier from 'eslint-config-prettier/flat';",
        },
        {
          oldLine: null,
          newLine: 5,
          type: 'added',
          content: "import globals from 'globals';",
        },
        { oldLine: 4, newLine: 6, type: 'context', content: '' },
        {
          oldLine: 5,
          newLine: 7,
          type: 'context',
          content: 'export default ts.config(',
        },
        {
          oldLine: 6,
          newLine: 8,
          type: 'context',
          content: "  { ignores: ['.vite/', 'out/', 'node_modules/'] },",
        },
        {
          oldLine: 7,
          newLine: 9,
          type: 'context',
          content: '  js.configs.recommended,',
        },
        {
          oldLine: 8,
          newLine: 10,
          type: 'context',
          content: '  ...ts.configs.recommended,',
        },
        {
          oldLine: 9,
          newLine: 11,
          type: 'context',
          content: "  ...svelte.configs['flat/recommended'],",
        },
        {
          oldLine: null,
          newLine: 12,
          type: 'added',
          content:
            '  { files: ["src/main/**/*"], languageOptions: { globals: globals.node } },',
        },
        {
          oldLine: null,
          newLine: 13,
          type: 'added',
          content:
            '  { files: ["src/renderer/**/*"], languageOptions: { globals: globals.browser } },',
        },
        { oldLine: null, newLine: 14, type: 'added', content: '  prettier,' },
        { oldLine: 10, newLine: 15, type: 'context', content: ');' },
      ],
    },
  ],
};
