// ESLint flat config (ESLint 10).
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'icons/**', '.bob/**', 'video/build/**', 'video/work/**', 'video/out/**'] },

  js.configs.recommended,

  // Extension code shared by every context
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, chrome: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'eqeqeq': ['error', 'always'],
      'prefer-const': 'error',
    },
  },

  // ES modules: service worker + shared helpers
  {
    files: ['src/background/**/*.js', 'src/shared/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.serviceworker, chrome: 'readonly' },
    },
  },

  // ES module sources bundled by esbuild into classic scripts: toolbar, popup, options, shared UI
  {
    files: ['src/content/**/*.js', 'src/popup/**/*.js', 'src/options/**/*.js', 'src/ui/**/*.js'],
    languageOptions: { sourceType: 'module' },
  },

  // Static tutorial page (plain browser script)
  {
    files: ['docs/tutorial/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },

  // Node tooling and tests
  {
    files: ['generate-icons.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['test/**/*.mjs', 'scripts/**/*.mjs', 'video/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
];
