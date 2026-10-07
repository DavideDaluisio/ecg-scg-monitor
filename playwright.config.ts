import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4173/ecg-scg-monitor/' },
  // Chromium only: the app targets Chrome (Web Bluetooth).
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/ecg-scg-monitor/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
