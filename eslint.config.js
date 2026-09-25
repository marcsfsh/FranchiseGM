// ESLint flat config. The engine rules enforce the CLAUDE.md hard rules: no DOM in src/engine
// and no Math.random anywhere.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const DOM_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'self',
  'location',
  'history',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
  'performance',
  'Worker',
  'Blob',
  'URL'
];

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'calibration/reports/',
      'coverage/',
      'test-results/',
      'playwright-report/'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG in src/engine/rng.' }
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // UI copy uses straight quotes and apostrophes.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/[\\u2018\\u2019\\u201C\\u201D]/]',
          message: 'Use straight quotes and apostrophes.'
        },
        {
          selector: 'TemplateElement[value.raw=/[\\u2018\\u2019\\u201C\\u201D]/]',
          message: 'Use straight quotes and apostrophes.'
        }
      ]
    }
  },
  {
    files: ['src/engine/**/*.ts'],
    languageOptions: { globals: { ...globals.es2021 } },
    rules: {
      'no-restricted-globals': [
        'error',
        ...DOM_GLOBALS.map(name => ({
          name,
          message: 'src/engine never touches the DOM or real-time timers.'
        }))
      ]
    }
  },
  {
    files: ['**/*.mjs', '.claude/hooks/*.mjs'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' }
  }
);
