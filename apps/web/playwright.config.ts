import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',

  globalSetup: path.join(__dirname, 'e2e/global-setup.ts'),

  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3002',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'authenticated',
      use: {
        ...devices['Desktop Chrome'],
        // Load authenticated session state
        storageState: path.join(__dirname, 'e2e/auth-state.json'),
      },
    },
    {
      name: 'unauthenticated',
      use: {
        ...devices['Desktop Chrome'],
        // No stored auth state for unauthenticated tests
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: true,  // Reuse existing dev server if available
    timeout: 120000,  // 2 minute timeout for slow Windows startup
  },
});
