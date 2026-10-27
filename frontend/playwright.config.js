import { defineConfig } from '@playwright/test';

// End-to-end checks against the built demo (run `npm run build:demo` first). The demo is the
// whole site and admin in the browser, so no backend is needed.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.js',
  fullyParallel: true,
  workers: process.env.CI ? 4 : 3,
  retries: process.env.CI ? 1 : 0,
  timeout: 240_000,
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/small-africa/',
    // Locally use the installed Chrome; CI installs Playwright's own Chromium.
    channel: process.env.CI ? undefined : 'chrome',
  },
  webServer: {
    command: 'npx vite preview --mode demo --port 4173 --strictPort',
    url: 'http://localhost:4173/small-africa/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
