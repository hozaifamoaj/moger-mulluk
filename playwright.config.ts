import { defineConfig, devices } from '@playwright/test';

// End-to-end UI journey tests. Separate from the Vitest unit suite (`tests/`):
// these drive a real browser against the running app and are not part of
// `npm run check` since they need a browser binary and a live dev server.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
