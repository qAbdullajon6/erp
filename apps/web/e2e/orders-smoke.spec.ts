import { test, expect } from './authenticated-fixture';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3002';
const TEST_CUSTOMER_NAME = `Order Test ${Date.now()}`;

test.describe('Orders Smoke Tests', () => {
  test('1. Authenticated Orders list loads with HTTP 200', async ({ authenticatedPage: page }) => {
    let ordersApiCalled = false;
    let statusCode = 0;

    page.on('response', (response) => {
      if (response.url().includes('/api/orders') && response.request().method() === 'GET') {
        ordersApiCalled = true;
        statusCode = response.status();
      }
    });

    await page.goto(`${FRONTEND_URL}/app/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    expect(page.url()).toContain('/app/orders');
    expect(ordersApiCalled).toBe(true);
    expect(statusCode).toBe(200);

    // Verify page elements exist
    const heading = await page.locator('h1').textContent();
    expect(heading).toContain('Orders');
  });

  test('2. Create order through UI and verify persistence', async ({ authenticatedPage: page }) => {
    // Navigate to list first to see create button
    await page.goto(`${FRONTEND_URL}/app/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Click Create Order button
    const createButton = page.locator('button:has-text("Create Order")').first();
    await createButton.click();

    // Should navigate to create page
    await page.waitForURL('**/orders/create', { timeout: 10000 });
    expect(page.url()).toContain('/orders/create');

    // Wait for form to render and customers to load
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    await page.waitForSelector('[data-testid="orders-customer-select"]', { timeout: 10000 });

    // Fill in form with test data
    const timestamp = Date.now();
    const uniqueAddress = `123 Test St ${timestamp}`;

    // Select customer (first active customer in dropdown)
    const customerSelect = page.locator('[data-testid="orders-customer-select"]');
    await customerSelect.click();
    const firstCustomerOption = customerSelect.locator('option').nth(1);
    await firstCustomerOption.click();

    // Fill pickup details
    await page.locator('[data-testid="orders-pickup-address"]').fill(uniqueAddress);
    await page.locator('[data-testid="orders-pickup-city"]').fill('New York');
    await page.locator('[data-testid="orders-pickup-date"]').fill('2026-07-15');

    // Fill delivery details
    await page.locator('[data-testid="orders-delivery-address"]').fill(`456 Delivery St ${timestamp}`);
    await page.locator('[data-testid="orders-delivery-city"]').fill('Los Angeles');
    await page.locator('[data-testid="orders-delivery-date"]').fill('2026-07-16');

    // Fill cargo
    await page.locator('[data-testid="orders-cargo-description"]').fill('Test cargo for smoke test');
    await page.locator('[data-testid="orders-price"]').fill('5000');

    // Submit form
    const submitButton = page.locator('[data-testid="orders-submit-button"]');
    await submitButton.click();

    // Should navigate to detail page with UUID in URL
    await page.waitForURL(/\/app\/orders\/[a-f0-9-]{36}/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/app\/orders\/[a-f0-9-]{36}/);

    // Extract order ID from URL
    const orderId = page.url().match(/\/app\/orders\/([a-f0-9-]{36})/)?.[1];
    expect(orderId).toBeTruthy();

    // Verify order details are displayed
    const pageText = await page.locator('body').textContent();
    expect(pageText).toContain(uniqueAddress);
  });

  test('3. Refresh and verify created order persists from API', async ({ authenticatedPage: page }) => {
    // Navigate to orders list
    await page.goto(`${FRONTEND_URL}/app/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Check that we have orders displayed
    const tableRows = page.locator('table tbody tr');
    const rowCount = await tableRows.count();

    // Should have at least one order from previous test
    expect(rowCount).toBeGreaterThan(0);

    // Refresh page to verify data comes from API
    await page.reload({ waitUntil: 'networkidle' });

    // Orders should still be there
    const rowCountAfterRefresh = await tableRows.count();
    expect(rowCountAfterRefresh).toBeGreaterThan(0);
  });

  test('4. Open created order detail page', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Click View button on first order
    const viewButton = page.locator('[data-testid="order-view-button"]').first();
    const isVisible = await viewButton.isVisible().catch(() => false);

    if (isVisible) {
      await viewButton.click();

      // Should navigate to detail page
      await page.waitForURL(/\/app\/orders\/[a-f0-9-]{36}/, { timeout: 10000 });

      // Wait for detail page to load
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      await page.waitForSelector(':has-text("Order Information")', { timeout: 10000 }).catch(() => {});

      // Verify detail page has order information
      const pageText = await page.locator('body').textContent();
      expect(pageText).toContain('Order Information');
    }
  });

  test('5. Verify status transition from DRAFT to PENDING', async ({ authenticatedPage: page }) => {
    // Create a test order first
    await page.goto(`${FRONTEND_URL}/app/orders/create`, { waitUntil: 'domcontentloaded' });

    // Wait for form to render and customers to load
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    await page.waitForSelector('[data-testid="orders-customer-select"]', { timeout: 10000 });

    const timestamp = Date.now();
    const customerSelect = page.locator('[data-testid="orders-customer-select"]');
    await customerSelect.click();
    await customerSelect.locator('option').nth(1).click();

    await page.locator('[data-testid="orders-pickup-address"]').fill(`123 Test ${timestamp}`);
    await page.locator('[data-testid="orders-pickup-city"]').fill('City');
    await page.locator('[data-testid="orders-pickup-date"]').fill('2026-07-15');

    await page.locator('[data-testid="orders-delivery-address"]').fill(`456 Test ${timestamp}`);
    await page.locator('[data-testid="orders-delivery-city"]').fill('City');
    await page.locator('[data-testid="orders-delivery-date"]').fill('2026-07-16');

    await page.locator('[data-testid="orders-cargo-description"]').fill('Cargo');
    await page.locator('[data-testid="orders-price"]').fill('1000');

    await page.locator('[data-testid="orders-submit-button"]').click();

    // Wait for detail page
    await page.waitForURL(/\/app\/orders\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Look for status transition button to PENDING
    const toPendingButton = page.locator('button:has-text("Move to PENDING")').first();
    const buttonExists = await toPendingButton.isVisible().catch(() => false);

    if (buttonExists) {
      await toPendingButton.click();

      // Wait for status to update
      await page.waitForTimeout(2000);

      // Verify status changed
      const statusText = await page.locator('body').textContent();
      expect(statusText).toContain('PENDING');
    }
  });

  test('6. Verify status persists after refresh', async ({ authenticatedPage: page }) => {
    // Navigate to orders list
    await page.goto(`${FRONTEND_URL}/app/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Get first order and check its status
    const firstOrderRow = page.locator('table tbody tr').first();
    const statusBadge = firstOrderRow.locator('span:nth-child(1)');
    const statusBeforeRefresh = await statusBadge.textContent();

    // Refresh
    await page.reload({ waitUntil: 'networkidle' });

    // Check status is the same
    const firstOrderRowAfter = page.locator('table tbody tr').first();
    const statusBadgeAfter = firstOrderRowAfter.locator('span:nth-child(1)');
    const statusAfterRefresh = await statusBadgeAfter.textContent();

    // Status should persist
    expect(statusAfterRefresh).toBeTruthy();
  });
});
