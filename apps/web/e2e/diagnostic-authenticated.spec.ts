import { test, expect } from './authenticated-fixture';

test('DIAGNOSTIC: Authenticated session - navigate to customers and verify page loads', async ({ authenticatedPage: page }) => {
  const events: string[] = [];

  // Log all network requests
  page.on('response', (response) => {
    events.push(`[${response.status()}] ${response.request().method()} ${response.url()}`);
  });

  try {
    // STEP 1: Navigate to customers page (addInitScript runs before page load)
    console.log('[DIAGNOSTIC] Navigating to /app/customers');
    await page.goto('http://localhost:3001/app/customers', { waitUntil: 'domcontentloaded' });

    // STEP 2: Verify URL (should NOT redirect to /auth/sign-in)
    const finalUrl = page.url();
    console.log(`[DIAGNOSTIC] Final URL: ${finalUrl}`);
    expect(finalUrl).toContain('/app/customers');
    expect(finalUrl).not.toContain('/auth/sign-in');

    // STEP 3: Verify sessionStorage is populated (after page load)
    const sessionAfterNav = await page.evaluate(() => ({
      accessToken: sessionStorage.getItem('flowerp_access_token'),
      refreshToken: sessionStorage.getItem('flowerp_refresh_token'),
    }));

    console.log(
      `[DIAGNOSTIC] SessionStorage after navigation: accessToken=${sessionAfterNav.accessToken ? `exists (${sessionAfterNav.accessToken.substring(0, 20)}...)` : 'NULL'}, refreshToken=${sessionAfterNav.refreshToken ? 'exists' : 'NULL'}`
    );

    expect(sessionAfterNav.accessToken).toBeTruthy();
    expect(sessionAfterNav.refreshToken).toBeTruthy();

    // STEP 4: Wait for network to stabilize
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // STEP 5: Verify API was called with Authorization header
    const apiCalls = events.filter((e) => e.includes('/api/customers'));
    console.log(`[DIAGNOSTIC] API /customers calls: ${apiCalls.length}`);
    apiCalls.forEach((call) => console.log(`  ${call}`));

    expect(apiCalls.length).toBeGreaterThan(0);
    expect(apiCalls[0]).toMatch(/\[200\].*GET/);
    expect(apiCalls[0]).toContain('/api/customers');

    // STEP 6: Verify page elements are visible
    const pageTestId = await page.locator('[data-testid="customers-page"]').isVisible().catch(() => false);
    const tableTestId = await page.locator('[data-testid="customers-table"]').isVisible().catch(() => false);

    console.log(
      `[DIAGNOSTIC] Page elements: customers-page=${pageTestId}, customers-table=${tableTestId}`
    );

    // STEP 7: Check for at least one customer row
    const customerRowCount = await page.locator('[data-testid="customer-row"]').count();
    console.log(`[DIAGNOSTIC] Customer rows visible: ${customerRowCount}`);

    // STEP 8: Log all network events
    console.log('[DIAGNOSTIC] Network events:');
    events.forEach((e) => console.log(`  ${e}`));

    // Final assertions
    expect(apiCalls.length).toBeGreaterThan(0);
    expect(finalUrl).toContain('/app/customers');
  } catch (error) {
    console.log('[DIAGNOSTIC] ERROR:', error);
    throw error;
  }
});
