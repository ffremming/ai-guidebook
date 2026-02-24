import { defineConfig, devices } from '@playwright/test';

const PORT = 3320;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `NEXTAUTH_URL=${BASE_URL} npm run db:seed && NEXTAUTH_URL=${BASE_URL} npm run build && NEXTAUTH_URL=${BASE_URL} npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
