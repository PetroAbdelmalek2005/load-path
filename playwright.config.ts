import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4174', viewport: { width: 1440, height: 950 }, trace: 'off', screenshot: 'only-on-failure' },
  webServer: { command: 'npx vite preview --port 4174 --strictPort', port: 4174, reuseExistingServer: true, timeout: 60_000 },
});
