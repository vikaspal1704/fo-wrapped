import { readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { serviceWorker } from './build/swPlugin';

// Icons and the manifest are precached; the Open Graph image is only for
// link previews and is not.
const publicFiles = readdirSync(new URL('./public', import.meta.url)).filter((f) => f !== 'og.png');

// `base` matches the GitHub Pages project path (TRD §10).
export default defineConfig({
  base: '/fo-wrapped/',
  plugins: [react(), serviceWorker(publicFiles)],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
  },
});
