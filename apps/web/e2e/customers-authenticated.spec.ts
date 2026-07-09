import { test, expect } from './authenticated-fixture';

const FRONTEND_URL = 'http://localhost:3001';

test.describe('Customers CRUD - Authenticated E2E Tests', () => {
  test('1. List page loads with authentication and displays content', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    expect(page.url()).toContain('/app/customers');
    expect(page.url()).not.toContain('/auth/sign-in');

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
  });

  test('2. API returns 200 with valid authentication', async ({ authenticatedPage: page }) => {
    const responses: { status: number; url: string }[] = [];

    page.on('response', (response) => {
      if (response.url().includes('/api/customers')) {
        responses.push({ status: response.status(), url: response.url() });
      }
    });

    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    expect(responses.length).toBeGreaterThan(0);
    expect(responses[0].status).toBe(200);
  });

  test('3. Session storage contains access token after navigation', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });

    const session = await page.evaluate(() => ({
      accessToken: sessionStorage.getItem('flowerp_access_token'),
      refreshToken: sessionStorage.getItem('flowerp_refresh_token'),
    }));

    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.accessToken).toMatch(/^ey[A-Za-z0-9_-]*\.ey[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*$/);
  });

  test('4. Page does not redirect to login after navigation', async ({ authenticatedPage: page }) => {
    let redirected = false;

    page.on('framenavigated', (frame) => {
      if (frame.url().includes('/auth/sign-in')) {
        redirected = true;
      }
    });

    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    expect(redirected).toBe(false);
    expect(page.url()).toContain('/app/customers');
  });

  test('5. Unauthenticated user cannot access protected route', async ({ page }) => {
    // Note: using regular 'page' fixture, not authenticatedPage
    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });

    // Should redirect to sign-in
    await page.waitForURL('**/auth/sign-in', { timeout: 10000 });
    expect(page.url()).toContain('/auth/sign-in');
  });
});
