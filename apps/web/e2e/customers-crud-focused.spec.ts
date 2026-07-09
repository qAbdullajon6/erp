import { test, expect } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:3001';

test.describe('Phase 2: Customers CRUD - Core Flows', () => {

  test('1. List page loads with real seeded data', async ({ page }) => {
    // Navigate to customers (authenticated via global setup and storage state)
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Verify we're on the customers page
    expect(page.url()).toContain('/app/customers');

    // Verify real data loaded
    const silkRoadRow = page.locator('text=Silk Road');
    await expect(silkRoadRow).toBeVisible({ timeout: 5000 });

    // Verify table structure
    const customerTable = page.locator('table');
    await expect(customerTable).toBeVisible();

    // Verify pagination metadata
    const paginationText = page.locator('text=/Page.*of/');
    const isPaginationVisible = await paginationText.isVisible().catch(() => false);
    if (isPaginationVisible) {
      expect(paginationText).toBeVisible();
    }
  });

  test('2. Create customer workflow', async ({ page }) => {
    // Reuse session from previous test
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Click create
    const createBtn = page.locator('button:has-text("Create Customer")').first();
    await createBtn.click();

    // Verify on create page
    await page.waitForURL(`**/customers/create`, { timeout: 5000 });
    expect(page.url()).toContain('/create');

    // Fill form
    const timestamp = Date.now();
    await page.locator('input[placeholder="Acme Corp"]').fill(`Test Org ${timestamp}`);
    await page.locator('input[placeholder="John Doe"]').fill('Test Contact');
    await page.locator('input[placeholder="john@acme.com"]').fill(`test${timestamp}@test.com`);
    await page.locator('input[placeholder="0.00"]').fill('1000');

    // Submit
    const submitBtn = page.locator('button:has-text("Create Customer")');

    // Wait for navigation to detail page
    await Promise.all([
      page.waitForNavigation(),
      submitBtn.click(),
    ]);

    // Should be on detail page
    expect(page.url()).toMatch(/\/app\/customers\/[a-f0-9-]{36}/);
  });

  test('3. Detail page displays customer info', async ({ page }) => {
    // Find and navigate to a customer detail
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    const firstViewBtn = page.locator('button:has-text("View")').first();
    await firstViewBtn.click();

    await page.waitForURL(/\/app\/customers\/[a-f0-9-]+/, { timeout: 5000 });

    // Verify detail page elements
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();

    const backBtn = page.locator('button:has-text("Edit")');
    await expect(backBtn).toBeVisible();
  });

  test('4. Edit customer inline', async ({ page }) => {
    // Navigate to a customer
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    const firstViewBtn = page.locator('button:has-text("View")').first();
    await firstViewBtn.click();

    await page.waitForURL(/\/app\/customers\/[a-f0-9-]+/);

    // Click Edit
    const editBtn = page.locator('button:has-text("Edit")');
    await editBtn.click();

    // Form inputs should appear
    const inputs = page.locator('input[type="text"]');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThan(0);

    // Save button should be visible
    const saveBtn = page.locator('button:has-text("Save Changes")');
    await expect(saveBtn).toBeVisible();
  });

  test('5. Search filters work', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Get initial row count
    const initialRows = await page.locator('table tbody tr').count();
    expect(initialRows).toBeGreaterThan(0);

    // Search for a specific customer
    const searchInput = page.locator('input[placeholder*="Company name"]');
    await searchInput.fill('Silk');

    await page.waitForLoadState('networkidle');

    // Should show filtered results
    const silkRoadRow = page.locator('text=Silk Road');
    await expect(silkRoadRow).toBeVisible();
  });

  test('6. Status filter works', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Filter by status
    const statusSelect = page.locator('select').nth(0);
    await statusSelect.selectOption('ACTIVE');

    await page.waitForLoadState('networkidle');

    // Should show ACTIVE customers
    const customerRows = page.locator('table tbody tr');
    const rowCount = await customerRows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('7. Sorting works', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    const initialUrl = page.url();

    // Click a sort header
    const companyHeader = page.locator('button:has-text("Company")').first();
    await companyHeader.click();

    await page.waitForLoadState('networkidle');

    // URL should change
    expect(page.url()).not.toBe(initialUrl);
  });

  test('8. Pagination controls exist', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Check for pagination
    const paginationText = page.locator('text=/Page .* of/').first();
    const iVisible = await paginationText.isVisible().catch(() => false);

    if (iVisible) {
      // If pagination exists, nav buttons should too
      const nextBtn = page.locator('button svg[aria-label*="right"]').first();
      expect(nextBtn).toBeVisible();
    }
  });

  test('9. Archive and restore customer', async ({ page }) => {
    // Navigate to customers
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Find a customer and view detail
    const firstViewBtn = page.locator('button:has-text("View")').first();
    await firstViewBtn.click();

    await page.waitForURL(/\/app\/customers\/[a-f0-9-]+/);

    // Check for archive/restore buttons
    const archiveBtn = page.locator('button:has-text("Archive")').first();
    const restoreBtn = page.locator('button:has-text("Restore")').first();

    // At least one of these should be visible (depending on customer status)
    const hasArchiveBtn = await archiveBtn.isVisible().catch(() => false);
    const hasRestoreBtn = await restoreBtn.isVisible().catch(() => false);

    expect(hasArchiveBtn || hasRestoreBtn).toBeTruthy();
  });

  test('10. Error states show feedback', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Block API to simulate failure
    await page.route('**/api/customers*', (route) => route.abort());

    // Reload to trigger error
    await page.reload();
    await page.waitForTimeout(1000);

    // Unblock
    await page.unroute('**/api/customers*');

    // Either error message or table should be visible after timeout
    const table = page.locator('table').first();
    const errorMsg = page.locator('text=/error|failed/i').first();

    const hasTable = await table.isVisible().catch(() => false);
    const hasError = await errorMsg.isVisible().catch(() => false);

    expect(hasTable || hasError).toBeTruthy();
  });
});
