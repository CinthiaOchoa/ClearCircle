import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: false, workers: 1,
  timeout: 30_000, reporter: [['list'],['html',{ open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : undefined },
  projects: [{ name: 'desktop',use: { ...devices['Desktop Chrome'],viewport: { width: 1440,height: 1000 } } },{ name: 'mobile',use: { ...devices['Pixel 7'],viewport: { width: 393,height: 852 } } }],
  webServer: [
    { command: 'node --experimental-strip-types tests/browser-agent.ts', url: 'http://127.0.0.1:8788/api/family', reuseExistingServer: false, env: { CLEARCIRCLE_API_TOKEN: 'synthetic-test-token-not-a-credential-0001' } },
    { command: 'npm run start -- --hostname 127.0.0.1', url: 'http://127.0.0.1:3000',reuseExistingServer: false,env: { NEXT_TELEMETRY_DISABLED: '1', CLEARCIRCLE_API_URL: 'http://127.0.0.1:8788',CLEARCIRCLE_API_TOKEN: 'synthetic-test-token-not-a-credential-0001',DASHBOARD_PASSWORD: 'clearcircle-test-password' } }
  ]
});
