import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const CLOUD_PORT = 4175;
// A second build with cloud settings for the Journal's account and sync tests (ADR-0001).
const CLOUD_ENV = 'VITE_SUPABASE_URL=https://cloud.test VITE_SUPABASE_ANON_KEY=test-anon-key VITE_JOURNAL_PRICE_MONTHLY=₹399 VITE_JOURNAL_PRICE_ANNUAL=₹3,999';
// Local sandboxes may ship a Chromium build other than the one this
// Playwright version expects; point PW_CHROMIUM_PATH at it. CI installs its own.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/fo-wrapped/`,
    acceptDownloads: true,
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'chromium', testIgnore: /journal-cloud/, use: { ...devices['Desktop Chrome'], ...(executablePath ? { launchOptions: { executablePath } } : {}) } },
    {
      name: 'cloud',
      testMatch: /journal-cloud/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${CLOUD_PORT}/fo-wrapped/`, ...(executablePath ? { launchOptions: { executablePath } } : {}) },
    },
  ],
  webServer: [
    {
      command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/fo-wrapped/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `env ${CLOUD_ENV} npx vite build --outDir dist-cloud && npx vite preview --outDir dist-cloud --port ${CLOUD_PORT} --strictPort`,
      url: `http://localhost:${CLOUD_PORT}/fo-wrapped/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
