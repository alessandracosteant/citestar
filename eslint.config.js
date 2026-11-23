// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import { builtinModules } from 'node:module';
import tseslint from 'typescript-eslint';

/** Globals that exist only in Node or only in browsers, plus network I/O. */
const PLATFORM_GLOBALS = [
  'process',
  'Buffer',
  'global',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'setImmediate',
  'clearImmediate',
  'window',
  'document',
  'navigator',
  'self',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
];

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Root config files and tooling run in Node.
    files: ['*.js', '*.ts', 'tools/**/*.ts', 'spec/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Pure packages run on any platform and do no I/O. The neutral build
    // (tools/neutral-build.ts) catches imports of Node built-ins; these rules
    // catch platform globals, which are not imports.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...PLATFORM_GLOBALS.map((name) => ({
          name,
          message: 'The core is platform-independent and I/O-free: inject this dependency instead.',
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: builtinModules.map((name) => ({
            name,
            message: 'No Node built-ins in the core.',
          })),
          patterns: [{ group: ['node:*'], message: 'No Node built-ins in the core.' }],
        },
      ],
    },
  },
  prettier,
);
