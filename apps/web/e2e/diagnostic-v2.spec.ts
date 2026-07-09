import { test, expect } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:3001';
const TEST_EMAIL = 'admin@flowerp.test';
const TEST_PASSWORD = 'FlowERP-Test-2026!';

test('DIAGNOSTIC-V2: Trace exact form submission behavior', async ({ page }) => {
  // Detailed logging of what actually happens
  const events: string[] = [];

  // Intercept ALL network requests to see what's happening
  page.on('request', (request) => {
    events.push(`[REQUEST] ${request.method()} ${request.url()}`);
  });

  page.on('response', (response) => {
    events.push(`[RESPONSE] ${response.status()} ${response.request().method()} ${response.url()}`);
  });

  // Track page navigations
  page.on('framenavigated', (frame) => {
    events.push(`[NAVIGATE] ${frame.url()}`);
  });

  // Track console logs
  page.on('console', (msg) => {
    events.push(`[CONSOLE] ${msg.type()}: ${msg.text()}`);
  });

  try {
    // Step 1: Navigate to login
    events.push('\n=== STEP 1: Navigate to /auth/sign-in ===');
    await page.goto(`${FRONTEND_URL}/auth/sign-in`, { waitUntil: 'domcontentloaded' });
    events.push(`Current URL: ${page.url()}`);
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Step 2: Find and log form state BEFORE filling
    events.push('\n=== STEP 2: Inspect form before filling ===');
    const emailInput = await page.$('input[type="email"]');
    const passwordInput = await page.$('input[type="password"]');
    const submitBtn = await page.$('button[type="submit"]');

    events.push(`Email input exists: ${emailInput ? 'YES' : 'NO'}`);
    events.push(`Password input exists: ${passwordInput ? 'YES' : 'NO'}`);
    events.push(`Submit button exists: ${submitBtn ? 'YES' : 'NO'}`);

    if (submitBtn) {
      const btnText = await submitBtn.textContent();
      events.push(`Submit button text: "${btnText}"`);
    }

    // Step 3: Fill inputs with EXTRA debugging
    events.push('\n=== STEP 3: Fill form inputs ===');

    // Use different technique - directly set value
    await page.fill('input[type="email"]', TEST_EMAIL);
    const filledEmail = await page.inputValue('input[type="email"]');
    events.push(`Email field filled: ${filledEmail === TEST_EMAIL ? 'SUCCESS' : 'FAILED'}`);
    events.push(`Email value: "${filledEmail}"`);

    await page.fill('input[type="password"]', TEST_PASSWORD);
    const filledPassword = await page.inputValue('input[type="password"]');
    events.push(`Password field filled: ${filledPassword === TEST_PASSWORD ? 'SUCCESS' : 'FAILED'}`);
    events.push(`Password value: "${filledPassword}"`);

    // Step 4: Check sessionStorage BEFORE submit
    events.push('\n=== STEP 4: Check sessionStorage before submit ===');
    const storageBefore = await page.evaluate(() => ({
      accessToken: sessionStorage.getItem('flowerp_access_token'),
      refreshToken: sessionStorage.getItem('flowerp_refresh_token'),
    }));
    events.push(`SessionStorage before submit: accessToken=${storageBefore.accessToken ? 'EXISTS' : 'NULL'}, refreshToken=${storageBefore.refreshToken ? 'EXISTS' : 'NULL'}`);

    // Step 5: Intercept the login POST specifically
    events.push('\n=== STEP 5: Set up fetch intercept and submit ===');

    let loginPostCalled = false;
    await page.route('**/api/auth/login', (route) => {
      loginPostCalled = true;
      events.push(`[INTERCEPT] POST /api/auth/login was CALLED`);
      route.continue();
    });

    // Also log the form's onSubmit
    await page.evaluate(() => {
      const originalFetch = window.fetch;
      (window as any).fetchLog = originalFetch;
      window.fetch = function(...args: any[]) {
        console.log('[FETCH_LOG]', args[0], args[1]?.method);
        return originalFetch.apply(this, args);
      };
    });

    // Step 6: Click submit button
    events.push('\n=== STEP 6: Click submit button ===');
    const beforeUrl = page.url();
    events.push(`URL before submit click: ${beforeUrl}`);

    await Promise.race([
      page.click('button[type="submit"]'),
      page.waitForTimeout(2000)
    ]).catch(() => {
      events.push('Submit button click timed out or failed');
    });

    // Wait a bit for submit to process
    await page.waitForTimeout(3000);

    const afterUrl = page.url();
    events.push(`URL after submit click: ${afterUrl}`);

    events.push(`\nForm submission called API: ${loginPostCalled ? 'YES' : 'NO'}`);

    // Step 7: Check if redirected
    if (afterUrl !== beforeUrl) {
      events.push(`\nPAGE NAVIGATED from:\n  ${beforeUrl}\nto:\n  ${afterUrl}`);
    } else {
      events.push(`\nPage did NOT navigate (stayed on same URL)`);
    }

    // Step 8: Check sessionStorage AFTER submit
    events.push('\n=== STEP 7: Check sessionStorage after submit ===');
    const storageAfter = await page.evaluate(() => ({
      accessToken: sessionStorage.getItem('flowerp_access_token'),
      refreshToken: sessionStorage.getItem('flowerp_refresh_token'),
    }));
    events.push(`SessionStorage after submit: accessToken=${storageAfter.accessToken ? 'EXISTS' : 'NULL'}, refreshToken=${storageAfter.refreshToken ? 'EXISTS' : 'NULL'}`);

    // Step 9: Print all events
    events.push('\n\n=== FULL EVENT LOG ===');
    console.log(events.join('\n'));

    // Final assertion
    expect(afterUrl).toContain('/app');
  } catch (error) {
    console.log('\n\n=== ERROR ===');
    console.log(events.join('\n'));
    console.log('\nException:', error);
    throw error;
  }
});
