const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 15000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8085',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'python3 -m http.server 8085',
    url: 'http://localhost:8085',
    reuseExistingServer: false,
    timeout: 10000,
    cwd: '/home/yadman/mock-tet',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  reporter: [['list']],
});
