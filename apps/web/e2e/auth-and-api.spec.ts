import { test, expect } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:3001';
const TEST_EMAIL = 'admin@flowerp.test';
const TEST_PASSWORD = 'FlowERP-Test-2026!';

test.describe('Phase 1.5: Auth & API Integration', () => {

  test('1. Unauthenticated routes should redirect to sign-in', async ({ page }) => {
    const routes = ['/app', '/app/customers', '/app/orders', '/app/drivers', '/app/vehicles'];

    for (const route of routes) {
      await page.goto(`${FRONTEND_URL}${route}`);
      await page.waitForURL(`**/auth/sign-in*`, { timeout: 10000 });
      expect(page.url()).toContain('/auth/sign-in');
    }
  });

  test('2. Login flow, authentication, and protected pages', async ({ page }) => {
    // === PART A: LOGIN ===
    await page.goto(`${FRONTEND_URL}/auth/sign-in`);
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
    const logoutButton = page.locator('button').filter({ hasText: /sign out|logout/i }).first();
    await logoutButton.click();

    await page.waitForURL(`**/auth/sign-in*`, { timeout: 5000 });

    const tokenAfterLogout = await page.evaluate(() => sessionStorage.getItem('flowerp_access_token'));
    expect(tokenAfterLogout).toBeNull();

    // === PART E: VERIFY CANNOT ACCESS /app AFTER LOGOUT ===
    await page.goto(`${FRONTEND_URL}/app`);
    await page.waitForURL(`**/auth/sign-in*`, { timeout: 5000 });
    expect(page.url()).toContain('/auth/sign-in');
  });

  test('3. Security configuration', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/auth/sign-in`);
    await page.waitForLoadState('domcontentloaded');

    const html = await page.content();

    // Should not have dev flags
    expect(html).not.toContain('VITE_ENABLE_DEV_AUTO_LOGIN=true');
    expect(html).not.toContain('MOCK_DATA');

    // CORS is implicitly verified by successful login in test 2
    // (if CORS was misconfigured, the login request would fail)
  });
});
