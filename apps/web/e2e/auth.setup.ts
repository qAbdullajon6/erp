import { chromium, expect } from '@playwright/test';
import * as path from 'path';

const FRONTEND_URL = 'http://localhost:3001';
const TEST_EMAIL = 'admin@flowerp.test';
const TEST_PASSWORD = 'FlowERP-Test-2026!';

async function authenticateUser() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to login
  await page.goto(`${FRONTEND_URL}/auth/sign-in`);

  // Fill in login form
  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitButton = page.locator('button[type="submit"]').first();

  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
  await submitButton.waitFor({ state: 'visible', timeout: 10000 });

  await emailInput.fill(TEST_EMAIL);
  await passwordInput.fill(TEST_PASSWORD);

  // Wait for login API response
  const loginResponse = await page.waitForResponse(
    (resp) => resp.url().includes('/auth/login') && resp.status() === 200,
    { timeout: 15000 }
  );

  expect(loginResponse.status()).toBe(200);

  // Click submit
  await submitButton.click();

  // Wait for navigation to /app
  await page.waitForURL(`**/app`, { timeout: 10000 });

  // Verify token in sessionStorage
  const token = await page.evaluate(() => sessionStorage.getItem('flowerp_access_token'));
  expect(token).toBeTruthy();

  // Save authenticated state
  await page.context().storageState({
    path: path.join(__dirname, 'auth-state.json'),
  });

  await browser.close();
  console.log('✅ Authentication state saved to auth-state.json');
}

authenticateUser().catch((error) => {
  console.error('❌ Failed to authenticate:', error.message);
  process.exit(1);
});
