import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base` matches the GitHub Pages project path (TRD §10).
export default defineConfig({
  base: '/fo-wrapped/',
  plugins: [react()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
