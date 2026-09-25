import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(executablePath ? { launchOptions: { executablePath } } : {}) } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/fo-wrapped/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
