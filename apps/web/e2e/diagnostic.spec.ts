import { test, expect, chromium } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:3001';
const API_URL = 'http://localhost:4000';
const TEST_EMAIL = 'admin@flowerp.test';
const TEST_PASSWORD = 'FlowERP-Test-2026!';

test.describe('DIAGNOSTIC: Auth flow and page rendering', () => {
  test('01-minimal: Login via UI and verify /app/customers page renders with API call', async () => {
    // Create fresh context - not using storageState
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Enable console logging
    page.on('console', (msg) => {
      console.log(`[BROWSER_CONSOLE] ${msg.type()}: ${msg.text()}`);
    });

    // Capture network requests
    const networkLog: any[] = [];
    page.on('response', (response) => {
      networkLog.push({
        url: response.url(),
        status: response.status(),
        method: response.request().method(),
        headers: response.request().headers(),
      });
      console.log(`[NETWORK] ${response.status()} ${response.request().method()} ${response.url()}`);
    });

    try {
      // STEP 1: Navigate to login
      console.log('\n=== STEP 1: Navigate to login ===');
      await page.goto(`${FRONTEND_URL}/auth/sign-in`, { waitUntil: 'domcontentloaded' });
      console.log(`URL after goto: ${page.url()}`);

      // STEP 2: Perform login via UI
      console.log('\n=== STEP 2: Login via UI ===');
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);

      const token_before_login = await page.evaluate(() => sessionStorage.getItem('flowerp_access_token'));
      console.log(`sessionStorage token before login: ${token_before_login ? 'EXISTS' : 'NULL'}`);

      // Click submit and wait for redirect
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => url.pathname.includes('/app'), { timeout: 30000 });

      console.log(`URL after login: ${page.url()}`);

      const token_after_login = await page.evaluate(() => sessionStorage.getItem('flowerp_access_token'));
      console.log(`sessionStorage token after login: ${token_after_login ? 'EXISTS (length: ' + token_after_login.length + ')' : 'NULL'}`);

      // STEP 3: Navigate to customers
      console.log('\n=== STEP 3: Navigate to /app/customers ===');
      await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
      console.log(`URL after navigate to customers: ${page.url()}`);

      // STEP 4: Wait for page to be interactive
      console.log('\n=== STEP 4: Wait for page to stabilize ===');
      await page.waitForLoadState('networkidle');
      console.log('Page reached networkidle state');

      // STEP 5: Capture page state
      console.log('\n=== STEP 5: Check page state ===');
      const currentUrl = page.url();
      console.log(`Current URL: ${currentUrl}`);

      if (currentUrl.includes('/auth/sign-in')) {
        console.log('ERROR: REDIRECTED TO LOGIN - Auth state lost or invalid');
      } else if (currentUrl.includes('/app/customers')) {
        console.log('SUCCESS: On /app/customers page');
      }

      // STEP 6: Check for API call
      console.log('\n=== STEP 6: Verify API requests ===');
      const customerApiCalls = networkLog.filter((r) => r.url.includes('/api/customers'));
      console.log(`API /customers calls made: ${customerApiCalls.length}`);
      customerApiCalls.forEach((call) => {
        console.log(`  - ${call.status} ${call.method} ${call.url}`);
        const authHeader = call.headers['authorization'];
        console.log(`    Authorization header: ${authHeader ? `Bearer ${authHeader.substring(7, 20)}...` : 'MISSING'}`);
      });

      // STEP 7: Check page elements
      console.log('\n=== STEP 7: Check page elements ===');
      const h1 = await page.locator('h1').first().textContent().catch(() => null);
      console.log(`Page h1: ${h1 || 'NOT FOUND'}`);

      const tables = await page.locator('table').count();
      console.log(`Tables found: ${tables}`);

      const silkRoad = await page.locator('text=Silk Road').count();
      console.log(`"Silk Road" text found: ${silkRoad > 0 ? 'YES' : 'NO'}`);

      // STEP 8: Screenshot at this point
      console.log('\n=== STEP 8: Capturing screenshot ===');
      await page.screenshot({ path: '/tmp/diagnostic-page-state.png' });
      console.log('Screenshot saved to /tmp/diagnostic-page-state.png');

      // STEP 9: Capture HTML
      console.log('\n=== STEP 9: Capturing page HTML ===');
      const html = await page.content();
      const htmlPreview = html.substring(0, 500);
      console.log(`HTML preview (first 500 chars): ${htmlPreview}`);

      // STEP 10: Get page error state
      console.log('\n=== STEP 10: Check for error/loading states ===');
      const errorMsg = await page.locator('[class*="error"]').first().textContent().catch(() => null);
      console.log(`Error message visible: ${errorMsg || 'NONE'}`);

      const loadingMsg = await page.locator('[class*="loading"]').first().textContent().catch(() => null);
      console.log(`Loading message visible: ${loadingMsg || 'NONE'}`);

      // STEP 11: Check backend logs captured
      console.log('\n=== STEP 11: Network summary ===');
      console.log(`Total network requests: ${networkLog.length}`);
      const failed = networkLog.filter((r) => r.status >= 400);
      console.log(`Failed requests (4xx/5xx): ${failed.length}`);
      failed.forEach((r) => {
        console.log(`  - ${r.status} ${r.method} ${r.url}`);
      });

      // Final assertion
      expect(page.url()).toContain('/app/customers');
      expect(silkRoad).toBeGreaterThan(0);

      await browser.close();
    } catch (error) {
      console.error('\n=== ERROR OCCURRED ===');
      console.error(error);

      // Capture final state
      const finalUrl = page.url();
      console.log(`Final URL on error: ${finalUrl}`);

      // Screenshot on error
      try {
        await page.screenshot({ path: '/tmp/diagnostic-error-state.png' });
        console.log('Error screenshot saved to /tmp/diagnostic-error-state.png');
      } catch {}

      // Page HTML on error
      try {
        const errorHtml = await page.content();
        console.log(`Page HTML on error (first 1000 chars):\n${errorHtml.substring(0, 1000)}`);
      } catch {}

      await browser.close();
      throw error;
    }
  });
});
