import { test, expect } from '@playwright/test';
import { FRONTEND_URL, ROLE_EMAILS, passwordFor } from './helpers';

/// This file used to hardcode `http://localhost:3001` and the admin
/// credentials. The dev server has not been on 3001 for a while, so every test
/// here was failing to connect rather than testing anything. Both now come from
/// the same helpers the rest of the suite uses, so they follow the environment.
const TEST_EMAIL = ROLE_EMAILS.ADMIN;
const TEST_PASSWORD = passwordFor('ADMIN');

test.describe('Phase 1.5: Auth & API Integration', () => {

  test('1. Unauthenticated routes should redirect to sign-in', async ({ page }) => {
    const routes = ['/app', '/app/customers', '/app/orders', '/app/drivers', '/app/vehicles'];

    for (const route of routes) {
      await page.goto(`${FRONTEND_URL}${route}`);
      await page.waitForURL(`**/login*`, { timeout: 10000 });
      expect(page.url()).toContain('/login');
    }
  });

  test('2. Login flow, authentication, and protected pages', async ({ page }) => {
    // === PART A: LOGIN ===
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await submitButton.waitFor({ state: 'visible', timeout: 5000 });

    await emailInput.fill(TEST_EMAIL);
    await passwordInput.fill(TEST_PASSWORD);

    const loginPromise = page.waitForResponse(
      (resp) => resp.url().includes('/auth/login') && resp.status() === 200,
      { timeout: 15000 }
    );

    await submitButton.click();
    const loginResponse = await loginPromise;

    expect(loginResponse.status()).toBe(200);

    // === PART B: VERIFY REDIRECT AND SESSION ===
    await page.waitForURL(`**/app`, { timeout: 10000 });
    expect(page.url()).toContain('/app');

    const sessionToken = await page.evaluate(() => sessionStorage.getItem('flowerp_access_token'));
    const localStorageJson = await page.evaluate(() => JSON.stringify(localStorage));

    expect(sessionToken).toBeTruthy();
    expect(sessionToken).toMatch(/^eyJ/);
    expect(localStorageJson).not.toContain('flowerp_access_token');

    // === PART C: VERIFY PROTECTED PAGES LOAD ===
    const pages = [
      { path: '/app/customers', name: 'Customers' },
      { path: '/app/orders', name: 'Orders' },
      { path: '/app/drivers', name: 'Drivers' },
    ];

    for (const { path } of pages) {
      await page.goto(`${FRONTEND_URL}${path}`);
      await page.waitForLoadState('domcontentloaded');

      // Should NOT redirect back to login (which would indicate failed auth)
      expect(page.url()).toContain(path);

      // Token should persist
      const stillHasToken = await page.evaluate(() => sessionStorage.getItem('flowerp_access_token'));
      expect(stillHasToken).toBeTruthy();
    }

    // === PART D: LOGOUT ===
    // Signing out lives behind the account menu and then a confirmation, rather
    // than being a bare button in the shell as it was when this was written.
    await page.getByRole('button', { name: /account menu/i }).click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /^sign out$/i }).click();

    await page.waitForURL(`**/login*`, { timeout: 15000 });

    const tokenAfterLogout = await page.evaluate(() => sessionStorage.getItem('flowerp_access_token'));
    expect(tokenAfterLogout).toBeNull();

    // === PART E: VERIFY CANNOT ACCESS /app AFTER LOGOUT ===
    await page.goto(`${FRONTEND_URL}/app`);
    await page.waitForURL(`**/login*`, { timeout: 5000 });
    expect(page.url()).toContain('/login');
  });

  test('3. Security configuration', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('domcontentloaded');

    const html = await page.content();

    // Should not have dev flags
    expect(html).not.toContain('VITE_ENABLE_DEV_AUTO_LOGIN=true');
    expect(html).not.toContain('MOCK_DATA');

    // CORS is implicitly verified by successful login in test 2
    // (if CORS was misconfigured, the login request would fail)
  });
});
