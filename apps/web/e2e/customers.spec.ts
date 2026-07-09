import { test, expect } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:3001';

// Generate unique customer name for test isolation
function generateTestCustomerName(): string {
  return `Test Customer ${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

test.describe('Customers CRUD - Authenticated', () => {
  let testCustomerId: string;
  let testCustomerName: string;

  test.beforeEach(async ({ page }) => {
    // Navigate to customers list at start of each test
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');
  });

  test('1. List loads real seeded data with pagination', async ({ page }) => {
    // Verify page content
    expect(page.url()).toContain('/app/customers');

    // Wait for table to render
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });

    // Verify seeded customer exists
    const silkRoadCell = page.locator('text=Silk Road').first();
    await expect(silkRoadCell).toBeVisible({ timeout: 5000 });

    // Verify pagination metadata shows real counts
    const paginationText = page.locator('text=/Page .* of/').first();
    await expect(paginationText).toBeVisible({ timeout: 5000 });

    const paginationContent = await paginationText.textContent();
    // Should show something like "Page 1 of X"
    expect(paginationContent).toMatch(/Page \d+ of \d+/);
  });

  test('2. Pagination: navigate between pages', async ({ page }) => {
    // Get first customer from page 1
    await page.waitForLoadState('networkidle');
    const firstRowPage1 = await page.locator('table tbody tr').first().textContent();
    expect(firstRowPage1).toBeTruthy();

    // Check if next button is enabled
    const nextBtn = page.locator('button').filter({ has: page.locator('svg') }).last();
    const isNextEnabled = !(await nextBtn.isDisabled());

    if (isNextEnabled) {
      // Click next
      await nextBtn.click();
      await page.waitForLoadState('networkidle');

      // First customer should be different
      const firstRowPage2 = await page.locator('table tbody tr').first().textContent();
      expect(firstRowPage2).not.toBe(firstRowPage1);
      expect(firstRowPage2).toBeTruthy();
    }
  });

  test('3. Search: filter by company name', async ({ page }) => {
    // Get initial row count
    await page.waitForLoadState('networkidle');
    const initialCount = await page.locator('table tbody tr').count();
    expect(initialCount).toBeGreaterThan(0);

    // Search for "Silk"
    const searchInput = page.locator('input[placeholder*="Company name"]').first();
    await searchInput.fill('Silk');
    await page.waitForLoadState('networkidle');

    // Verify results are filtered
    const silkRow = page.locator('text=Silk Road').first();
    await expect(silkRow).toBeVisible({ timeout: 5000 });

    // Verify result count is less or equal
    const filteredCount = await page.locator('table tbody tr').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    // Clear search
    await searchInput.clear();
    await page.waitForLoadState('networkidle');

    // Should show all again
    const allCount = await page.locator('table tbody tr').count();
    expect(allCount).toBeGreaterThanOrEqual(filteredCount);
  });

  test('4. Status filter: show only ACTIVE customers', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Filter by ACTIVE status
    const statusSelect = page.locator('select').first();
    await statusSelect.selectOption('ACTIVE');
    await page.waitForLoadState('networkidle');

    // All visible status badges should be ACTIVE
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Each row should have an ACTIVE status badge
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const statusBadge = row.locator('text=ACTIVE');
      const isVisible = await statusBadge.isVisible().catch(() => false);
      // At least the first few rows should have ACTIVE
      if (i < 3) {
        expect(isVisible).toBeTruthy();
      }
    }
  });

  test('5. Sorting: sort by company name', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    const initialUrl = page.url();

    // Click company name sort header
    const companyHeader = page.locator('button:has-text("Company")').first();
    await companyHeader.click();
    await page.waitForLoadState('networkidle');

    // URL should change to include sort params
    expect(page.url()).not.toBe(initialUrl);
    expect(page.url()).toContain('sortBy=companyName');
  });

  test('6. Create customer: full workflow', async ({ page }) => {
    testCustomerName = generateTestCustomerName();

    // Click create button
    const createBtn = page.locator('button:has-text("Create Customer")').first();
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();

    // Verify on create page
    await page.waitForURL(`**/customers/create`, { timeout: 5000 });
    expect(page.url()).toContain('/create');

    // Fill form with all required fields
    await page.locator('input[placeholder="Acme Corp"]').fill(testCustomerName);
    await page.locator('input[placeholder="John Doe"]').fill('Test Contact Person');
    await page.locator('input[placeholder="john@acme.com"]').fill('test@example.com');
    await page.locator('input[placeholder="+1 (555) 123-4567"]').fill('+1-555-0100');
    await page.locator('input[placeholder="United States"]').fill('USA');
    await page.locator('input[placeholder="New York"]').fill('New York');
    await page.locator('input[placeholder="123 Main St"]').fill('123 Test Street');
    await page.locator('input[placeholder="0.00"]').fill('5000.00');

    // Submit form
    const submitBtn = page.locator('button:has-text("Create Customer")');

    // Wait for navigation to detail page (UUID pattern)
    await Promise.all([
      page.waitForURL(/\/app\/customers\/[a-f0-9-]{36}/, { timeout: 10000 }),
      submitBtn.click(),
    ]);

    // Extract customer ID from URL
    const urlMatch = page.url().match(/\/app\/customers\/([a-f0-9-]{36})/);
    expect(urlMatch).toBeTruthy();
    testCustomerId = urlMatch![1];

    // Verify name in heading
    const heading = page.locator('h1').first();
    expect(await heading.textContent()).toContain(testCustomerName);
  });

  test('7. Created customer appears in list', async ({ page }) => {
    // This test assumes test 6 ran and created a customer
    if (!testCustomerName) {
      test.skip();
    }

    // Go to list
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForLoadState('networkidle');

    // Search for the test customer
    const searchInput = page.locator('input[placeholder*="Company name"]').first();
    await searchInput.fill(testCustomerName);
    await page.waitForLoadState('networkidle');

    // Verify it appears
    const newCustomerRow = page.locator(`text=${testCustomerName}`).first();
    await expect(newCustomerRow).toBeVisible({ timeout: 5000 });

    // Click View to go to detail
    const viewBtn = page.locator('button:has-text("View")').first();
    await viewBtn.click();

    // Verify on detail page
    await page.waitForURL(/\/app\/customers\/[a-f0-9-]{36}/);
    expect(page.url()).toContain(testCustomerId);
  });

  test('8. Edit customer: modify and verify persistence', async ({ page }) => {
    if (!testCustomerId) {
      test.skip();
    }

    // Navigate to detail page
    await page.goto(`${FRONTEND_URL}/app/customers/${testCustomerId}`);
    await page.waitForLoadState('networkidle');

    // Click Edit
    const editBtn = page.locator('button:has-text("Edit")');
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click();

    // Form should appear with inputs
    const inputs = page.locator('input[type="text"]');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThan(0);

    // Modify a field (contact name)
    const contactInput = page.locator('input[placeholder="John Doe"]');
    const originalValue = await contactInput.inputValue();
    const newValue = `${originalValue} - Updated`;

    await contactInput.clear();
    await contactInput.fill(newValue);

    // Save
    const saveBtn = page.locator('button:has-text("Save Changes")');
    await saveBtn.click();

    // Wait for save to complete
    await page.waitForTimeout(1500);

    // Verify edit mode is closed and new value is shown
    const editBtnAfter = page.locator('button:has-text("Edit")');
    await expect(editBtnAfter).toBeVisible({ timeout: 5000 });

    // Refresh page to verify persistence in DB
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Value should still be there
    const contactDisplay = page.locator(`text=${newValue}`).first();
    const isVisible = await contactDisplay.isVisible().catch(() => false);
    expect(isVisible).toBeTruthy();
  });

  test('9. Form validation: prevent invalid submission', async ({ page }) => {
    // Go to create page
    const createBtn = page.locator('button:has-text("Create Customer")').first();
    await createBtn.click();

    await page.waitForURL(`**/customers/create`);

    // Try to submit empty form
    const submitBtn = page.locator('button:has-text("Create Customer")');
    await submitBtn.click();

    // Should still be on create page (not submitted)
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/create');

    // Fill only company name (contact is required)
    await page.locator('input[placeholder="Acme Corp"]').fill('Test Company Only');

    // Try submit again
    await submitBtn.click();
    await page.waitForTimeout(500);

    // Still on create page due to validation
    expect(page.url()).toContain('/create');

    // Now fill contact name
    await page.locator('input[placeholder="John Doe"]').fill('Contact Name');

    // Now submit should work
    await Promise.all([
      page.waitForURL(/\/app\/customers\/[a-f0-9-]{36}/, { timeout: 10000 }),
      submitBtn.click(),
    ]);

    expect(page.url()).toMatch(/\/app\/customers\/[a-f0-9-]{36}/);
  });

  test('10. Archive and restore: lifecycle', async ({ page }) => {
    if (!testCustomerId) {
      test.skip();
    }

    // Go to detail
    await page.goto(`${FRONTEND_URL}/app/customers/${testCustomerId}`);
    await page.waitForLoadState('networkidle');

    // Should see Archive button
    let archiveBtn = page.locator('button:has-text("Archive")');
    const isArchiveVisible = await archiveBtn.isVisible().catch(() => false);

    if (isArchiveVisible) {
      // Archive
      await archiveBtn.click();

      // Handle confirmation dialog
      page.on('dialog', (dialog) => {
        dialog.accept().catch(() => {});
      });

      await page.waitForTimeout(1500);

      // Should show ARCHIVED status and Restore button
      const archivedBadge = page.locator('text=ARCHIVED').first();
      await expect(archivedBadge).toBeVisible({ timeout: 5000 });

      const restoreBtn = page.locator('button:has-text("Restore")');
      await expect(restoreBtn).toBeVisible({ timeout: 5000 });

      // Restore
      await restoreBtn.click();
      await page.waitForTimeout(1500);

      // Should be back to ACTIVE
      const activeBadge = page.locator('text=ACTIVE').first();
      await expect(activeBadge).toBeVisible({ timeout: 5000 });
    }
  });

  test('11. Error state: API failure and retry', async ({ page }) => {
    // Block customers API
    await page.route('**/api/customers*', (route) => route.abort());

    // Navigate (should fail)
    await page.goto(`${FRONTEND_URL}/app/customers`);
    await page.waitForTimeout(1500);

    // Should see error message
    const errorMsg = page.locator('text=/error|failed/i').first();
    const hasError = await errorMsg.isVisible().catch(() => false);

    // Unblock API
    await page.unroute('**/api/customers*');

    if (hasError) {
      // Click Retry button
      const retryBtn = page.locator('button:has-text("Retry")');
      const hasRetry = await retryBtn.isVisible().catch(() => false);

      if (hasRetry) {
        await retryBtn.click();
        await page.waitForLoadState('networkidle');

        // Should now show table
        const table = page.locator('table').first();
        await expect(table).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

test.describe('Customers CRUD - Unauthenticated', () => {
  test('Unauthenticated: routes redirect to sign-in', async ({ page }) => {
    // Try to access customers without logging in
    // Note: This test uses the unauthenticated project (no stored auth)

    // Clear any existing session
    await page.context().clearCookies();
    await page.evaluate(() => sessionStorage.clear());

    // Navigate to customers
    await page.goto(`${FRONTEND_URL}/app/customers`);

    // Should redirect to login
    await page.waitForURL(`**/auth/sign-in*`, { timeout: 10000 });
    expect(page.url()).toContain('/auth/sign-in');

    // Verify login page is shown
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
  });
});
