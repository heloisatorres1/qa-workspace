import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Screenshot helper for design review; run with SCREENS=1.
  testIgnore: process.env.SCREENS ? [] : ['**/_screens.spec.ts'],
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5179', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: { command: 'npx vite --port 5179 --strictPort', url: 'http://localhost:5179', reuseExistingServer: true },
});
