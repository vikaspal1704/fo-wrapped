import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Network, storage and local-time APIs are banned in the engine and worker so
// user data cannot leave the device and results never depend on the device
// time zone (TRD §5, §7).
const bannedGlobals = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
].map((name) => ({ name, message: 'Not allowed in engine/worker code (TRD §7).' }));

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['src/engine/**/*.ts', 'src/worker/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...bannedGlobals],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: 'Not allowed (TRD §7).' },
        { object: 'Date', property: 'now', message: 'Engine must be deterministic (PRD F-EN-6).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message: 'No floating-point money; use money.ts (PRD F-EN-4).',
        },
        {
          selector: "CallExpression[callee.property.name=/^get(Hours|Minutes|Date|Day|Month|FullYear)$/]",
          message: 'Local-time getters depend on the device time zone; use time.ts (PRD F-EN-5).',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
