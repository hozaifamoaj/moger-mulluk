import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['phaser'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'fetch', 'performance'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use src/sim/rng.ts instead.' },
        { object: 'Date', property: 'now', message: 'sim.step takes dt as a parameter; it must not read the clock.' },
      ],
    },
  },
);
