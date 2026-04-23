import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';

export default ts.config(
  {
    ignores: [
      '.vite/',
      'out/',
      'node_modules/',
      'playwright-report/',
      'test-results/',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: ts.parser } },
    rules: {
      'svelte/require-each-key': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: { parser: ts.parser },
  },
  {
    files: ['src/main/**/*', 'src/preload/**/*', 'e2e/**/*'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/renderer/**/*'],
    languageOptions: { globals: globals.browser },
  },
  prettier,
);
