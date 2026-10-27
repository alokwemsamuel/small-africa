import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  { ignores: ['dist', 'dist-ssr', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Components are checked by tests and Zod at the data edges, not by PropTypes.
      'react/prop-types': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.name='localStorage'][property.name=/^(setItem|getItem)$/] > Literal[value=/token|auth|session/i]",
          message: 'Never store auth tokens in localStorage.',
        },
      ],
    },
  },
  {
    // Tests use Vitest's globals (describe, it, expect, vi).
    files: ['**/*.test.{js,jsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.vitest } },
  },
  {
    // Node-side files: build and test config, and scripts.
    files: [
      'vite.config.js',
      'eslint.config.js',
      'playwright.config.js',
      'scripts/**',
      'src/entry-server.jsx',
    ],
    languageOptions: { globals: globals.node },
  },
];
