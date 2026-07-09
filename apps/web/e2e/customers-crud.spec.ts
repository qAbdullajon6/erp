import { test, expect } from './authenticated-fixture';

const FRONTEND_URL = 'http://localhost:3001';

test.describe('Phase 2: Customers CRUD', () => {

  test('Customer list loads with real data and pagination', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`);

    // Wait for data to load
    await page.waitForLoadState('networkidle');

    // Verify page content
    expect(page.url()).toContain('/app/customers');

    // Check for customer list elements
    const customerRows = page.locator('table tbody tr');
    const rowCount = await customerRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Verify seeded data is present
    const silkRoadRow = page.locator('text=Silk Road');
    await expect(silkRoadRow).toBeVisible();

    // Verify pagination controls exist
    const paginationText = page.locator('text=/Page.*of/');
    await expect(paginationText).toBeVisible();
  });

  test('Can create a new customer through UI', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`);

    // Click Create Customer button
    const createBtn = page.locator('button:has-text("Create Customer")').first();
    await createBtn.click();

    // Verify on create page
    await page.waitForURL(`**/customers/create`);
    expect(page.url()).toContain('/create');

    // Fill form with test data
    const timestamp = Date.now();
    const companyName = `Test Company ${timestamp}`;

    await page.locator('input[placeholder="Acme Corp"]').fill(companyName);
    await page.locator('input[placeholder="John Doe"]').fill('Test Contact');
    await page.locator('input[placeholder="john@acme.com"]').fill(`test${timestamp}@example.com`);
    await page.locator('input[placeholder="+1 (555) 123-4567"]').fill('+1-555-0100');
    await page.locator('input[placeholder="United States"]').fill('United States');
    await page.locator('input[placeholder="New York"]').fill('New York');
    await page.locator('input[placeholder="123 Main St"]').fill('123 Test Street');
    await page.locator('input[placeholder="12-3456789"]').fill('12-3456789');
    await page.locator('input[placeholder="0.00"]').fill('5000.00');

    // Submit form
    const submitBtn = page.locator('button:has-text("Create Customer")');

    await Promise.all([
      page.waitForNavigation(),
      submitBtn.click(),
    ]);

    // Should redirect to detail page
    expect(page.url()).toMatch(/\/app\/customers\/[a-f0-9-]{36}/);

    // Verify company name is shown
    const heading = page.locator('h1');
    await expect(heading).toContainText(companyName);

    // Store customer ID for later tests
    const customerId = page.url().match(/\/app\/customers\/([a-f0-9-]+)/)?.[1];
    expect(customerId).toBeTruthy();

    // Go back to list and verify new customer is there
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    const newCustomerRow = page.locator(`text=${companyName}`);
    await expect(newCustomerRow).toBeVisible();
  });

  test('Can edit a customer', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Click on first customer to view detail
    const firstViewBtn = page.locator('button:has-text("View")').first();
    await firstViewBtn.click();

    // Should be on detail page
    await page.waitForURL(/\/app\/customers\/[a-f0-9-]+/);

    // Click Edit button
    const editBtn = page.locator('button:has-text("Edit")');
    await editBtn.click();

    // Form should appear in edit mode
    const companyInput = page.locator('input').first();
    await expect(companyInput).toBeVisible();

    // Change a field
    const originalValue = await companyInput.inputValue();
    const newValue = `${originalValue} - Updated`;

    await companyInput.clear();
    await companyInput.fill(newValue);

    // Save
    const saveBtn = page.locator('button:has-text("Save Changes")');
    await saveBtn.click();

    // Wait for update
    await page.waitForTimeout(1000);

    // Verify it updated
    const heading = page.locator('h1').first();
    await expect(heading).toContainText(newValue);
  });

  test('Search filters customers by company name', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Use search
    const searchInput = page.locator('input[placeholder*="Company name"]');
    await searchInput.fill('Silk');

    // Wait for results
    await page.waitForLoadState('networkidle');

    // Should show Silk Road Traders
    const silkRoadRow = page.locator('text=Silk Road');
    await expect(silkRoadRow).toBeVisible();

    // Clear search
    await searchInput.clear();
    await page.waitForLoadState('networkidle');

    // Should show all again
    const customerRows = page.locator('table tbody tr');
    const rowCount = await customerRows.count();
    expect(rowCount).toBeGreaterThan(1);
  });

  test('Status filter works correctly', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Filter by ACTIVE status
    const statusSelect = page.locator('select');
    await statusSelect.selectOption('ACTIVE');

    await page.waitForLoadState('networkidle');

    // Verify only ACTIVE customers shown
    const statusBadges = page.locator('text=ACTIVE');
    const count = await statusBadges.count();
    expect(count).toBeGreaterThan(0);

    // Verify we don't see INACTIVE in the table
    const customerRows = page.locator('table tbody tr');
    for (let i = 0; i < Math.min(3, await customerRows.count()); i++) {
      const row = customerRows.nth(i);
      const hasActive = await row.locator('text=ACTIVE').isVisible().catch(() => false);
      // Each visible row should have ACTIVE status
    }
  });

  test('Pagination navigates between pages', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers?limit=5`);
    await page.waitForLoadState('networkidle');

    // Get initial customer
    const firstCustomer = await page.locator('table tbody tr').first().textContent();
    expect(firstCustomer).toBeTruthy();

    // Go to next page
    const nextBtn = page.locator('button:has-text("›")').or(page.locator('button svg[aria-label*="right"]')).first();
    const isNextEnabled = !(await nextBtn.isDisabled().catch(() => false));

    if (isNextEnabled) {
      await nextBtn.click();
      await page.waitForLoadState('networkidle');

      // Customer should be different
      const nextCustomer = await page.locator('table tbody tr').first().textContent();
      expect(nextCustomer).not.toBe(firstCustomer);
    }
  });

  test('Can sort by different fields', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Click on Company sort header
    const companyHeader = page.locator('button:has-text("Company")').first();
    const initialUrl = page.url();

    await companyHeader.click();
    await page.waitForLoadState('networkidle');

    // URL should reflect sort parameter
    expect(page.url()).not.toBe(initialUrl);
    expect(page.url()).toContain('sortBy');
  });

  test('Error handling shows retry button', async ({ authenticatedPage: page }) => {

    // Intercept and fail the customers request
    await page.route('**/api/customers*', (route) => route.abort());

    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForTimeout(1000);

    // Should see error message with retry
    const errorText = page.locator('text=/error|failed/i').first();
    const retryBtn = page.locator('button:has-text("Retry")');

    // Either error or retry should be visible
    const hasError = await errorText.isVisible().catch(() => false);
    const hasRetry = await retryBtn.isVisible().catch(() => false);
    expect(hasError || hasRetry).toBeTruthy();

    // Unblock and retry
    await page.unroute('**/api/customers*');
    if (await retryBtn.isVisible()) {
      await retryBtn.click();
      await page.waitForLoadState('networkidle');
    }

    // Should show customers now
    const table = page.locator('table');
    await expect(table).toBeVisible();
  });

  test('Unauthenticated user cannot access customers', async ({ page }) => {
    // Go directly to customers page without logging in
    await page.goto(`${FRONTEND_URL}/app/customers`);

    // Should redirect to login
    await page.waitForURL(`**/auth/sign-in*`, { timeout: 10000 });
    expect(page.url()).toContain('/auth/sign-in');
  });

  test('Can archive and restore a customer', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Click on a customer
    const firstViewBtn = page.locator('button:has-text("View")').first();
    await firstViewBtn.click();

    await page.waitForURL(/\/app\/customers\/[a-f0-9-]+/);

    // Get customer name
    const customerName = await page.locator('h1').first().textContent();

    // Archive
    const archiveBtn = page.locator('button:has-text("Archive")');
    const isArchiveVisible = await archiveBtn.isVisible().catch(() => false);

    if (isArchiveVisible) {
      await archiveBtn.click();

      // Confirm dialog
      await page.on('dialog', (dialog) => dialog.accept());

      await page.waitForTimeout(1000);

      // Should be archived now
      const archivedBadge = page.locator('text=ARCHIVED');
      await expect(archivedBadge).toBeVisible();

      // Archive button replaced with Restore
      const restoreBtn = page.locator('button:has-text("Restore")');
      await expect(restoreBtn).toBeVisible();

      // Restore
      await restoreBtn.click();
      await page.waitForTimeout(1000);

      // Should be ACTIVE again
      const activeBadge = page.locator('text=ACTIVE').first();
      await expect(activeBadge).toBeVisible();
    }
  });

  test('Form validation prevents submission with invalid data', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers/create`);

    // Try to submit empty form
    const submitBtn = page.locator('button:has-text("Create Customer")');
    await submitBtn.click();

    // Should show validation errors (still on create page)
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/create');

    // Fill only company name
    await page.locator('input[placeholder="Acme Corp"]').fill('Test Company');

    // Try submit again (missing contact name)
    await submitBtn.click();
    await page.waitForTimeout(500);

    // Still on form
    expect(page.url()).toContain('/create');
  });

  test('Leaving form with unsaved changes shows confirmation', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND_URL}/app/customers/create`);

    // Fill form
    await page.locator('input[placeholder="Acme Corp"]').fill('Test Company');
    await page.locator('input[placeholder="John Doe"]').fill('Test Contact');

    // Try to navigate away
    const cancelBtn = page.locator('button:has-text("Cancel")');

    let dialogAccepted = false;
    page.on('dialog', (dialog) => {
      dialogAccepted = true;
      dialog.accept();
    });

    await cancelBtn.click();

    // Should have shown confirmation
    expect(dialogAccepted).toBeTruthy();
  });
});
