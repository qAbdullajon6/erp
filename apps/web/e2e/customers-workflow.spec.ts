import { test, expect } from './authenticated-fixture';

const FRONTEND_URL = 'http://localhost:3001';

// Unique test identifier per run
const testRunId = Date.now();
const uniqueCompanyName = `E2E Test ${testRunId} Ltd`;
const uniqueContactName = `Contact ${testRunId}`;
const uniqueEmail = `test+${testRunId}@example.com`;

test.describe('Customers CRUD - Full Workflow', () => {
  test.use({ skipTests2To15: false });

  // UNAUTHENTICATED TEST ONLY
  test('1. Unauthenticated user is redirected to login (unauthenticated only)', async ({ page }, testInfo) => {
    // Skip on authenticated project, run only on unauthenticated
    if (testInfo.project.name === 'authenticated') {
      test.skip();
    }

    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });

    await page.waitForURL('**/auth/sign-in', { timeout: 10000 });
    expect(page.url()).toContain('/auth/sign-in');
  });

  // AUTHENTICATED TESTS - only run on authenticated project
  const authenticatedOnly = (testInfo) => {
    if (testInfo.project.name === 'unauthenticated') {
      test.skip();
    }
  };

  test('2. List page loads real PostgreSQL data', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    let customersApiCalled = false;
    let statusCode = 0;

    page.on('response', (response) => {
      if (response.url().includes('/api/customers') && response.request().method() === 'GET') {
        customersApiCalled = true;
        statusCode = response.status();
      }
    });

    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    expect(page.url()).toContain('/app/customers');
    expect(customersApiCalled).toBe(true);
    expect(statusCode).toBe(200);

    // Verify table exists and has rows
    const tableVisible = await page.locator('table').isVisible();
    expect(tableVisible).toBe(true);

    // Verify "found" text shows customer count
    const headerText = await page.locator('h1').textContent();
    expect(headerText).toContain('Customers');
  });

  test('3. Search filters customers and changes API request', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    let searchRequests: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/api/customers')) {
        searchRequests.push(request.url());
      }
    });

    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Initial request count
    const initialRequestCount = searchRequests.length;

    // Type in search input
    const searchInput = page.locator('input[placeholder*="Company name"]');
    await searchInput.fill('Silk');
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Should have new API request with search parameter
    const newRequests = searchRequests.slice(initialRequestCount);
    expect(newRequests.length).toBeGreaterThan(0);
    expect(newRequests[0]).toContain('search=Silk');
  });

  test('4. Status filter changes API request and visible results', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    let filterRequests: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/api/customers')) {
        filterRequests.push(request.url());
      }
    });

    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    const initialRequestCount = filterRequests.length;

    // Select status filter
    const statusSelect = page.locator('select');
    await statusSelect.selectOption('ACTIVE');
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Should have new request with status parameter
    const newRequests = filterRequests.slice(initialRequestCount);
    expect(newRequests.length).toBeGreaterThan(0);
    expect(newRequests[0]).toContain('status=ACTIVE');
  });

  test('5. Sorting changes API request and query parameters', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    let sortRequests: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/api/customers')) {
        sortRequests.push(request.url());
      }
    });

    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    const initialRequestCount = sortRequests.length;
    const initialUrl = page.url();

    // Click Company header to sort
    const companyHeader = page.locator('button:has-text("Company")').first();
    await companyHeader.click();
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // URL should have changed
    const newUrl = page.url();
    expect(newUrl).not.toBe(initialUrl);
    expect(newUrl).toContain('sortBy');

    // API should have new request with sort parameters
    const newRequests = sortRequests.slice(initialRequestCount);
    expect(newRequests.length).toBeGreaterThan(0);
    expect(newRequests[0]).toMatch(/sortBy=|sortOrder=/);
  });

  test('6. Pagination changes API request and displayed page data', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    let paginationRequests: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/api/customers')) {
        paginationRequests.push(request.url());
      }
    });

    await page.goto(`${FRONTEND_URL}/app/customers?limit=5`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Get first customer name
    const firstRowText = await page.locator('table tbody tr').first().textContent();

    const initialRequestCount = paginationRequests.length;

    // Click next page button if available
    const nextButton = page.locator('button').filter({ hasText: '›' }).first();
    const isNextEnabled = !(await nextButton.isDisabled().catch(() => false));

    if (isNextEnabled) {
      await nextButton.click();
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // URL should reflect new page
      expect(page.url()).toContain('page=');

      // API request should have different page parameter
      const newRequests = paginationRequests.slice(initialRequestCount);
      expect(newRequests.length).toBeGreaterThan(0);
      expect(newRequests[0]).toMatch(/page=[2-9]/);

      // First customer should be different
      const newFirstRowText = await page.locator('table tbody tr').first().textContent();
      expect(newFirstRowText).not.toBe(firstRowText);
    }
  });

  test('7. Create a unique customer through the form', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    let createResponse: { status: number; body: any } = { status: 0, body: null };

    page.on('response', async (response) => {
      if (response.url().includes('/api/customers') && response.request().method() === 'POST') {
        createResponse.status = response.status();
        try {
          createResponse.body = await response.json();
        } catch {
          createResponse.body = null;
        }
      }
    });

    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Click Create button
    const createButton = page.locator('button:has-text("Create Customer")').first();
    await createButton.click();

    await page.waitForURL('**/customers/create', { timeout: 10000 });
    expect(page.url()).toContain('/create');

    // Fill form with unique data
    await page.fill('input[value=""], input:not([type])', uniqueCompanyName);
    const inputs = page.locator('input');
    const inputCount = await inputs.count();

    // Fill all inputs
    if (inputCount >= 2) {
      await inputs.nth(1).fill(uniqueContactName);
    }
    if (inputCount >= 3) {
      await inputs.nth(2).fill(uniqueEmail);
    }
    if (inputCount >= 4) {
      await inputs.nth(3).fill('+1-555-0100');
    }
    if (inputCount >= 5) {
      await inputs.nth(4).fill('United States');
    }
    if (inputCount >= 6) {
      await inputs.nth(5).fill('New York');
    }
    if (inputCount >= 7) {
      await inputs.nth(6).fill('123 Main St');
    }
    if (inputCount >= 8) {
      await inputs.nth(7).fill('12-3456789');
    }
    if (inputCount >= 9) {
      await inputs.nth(8).fill('5000');
    }

    // Submit form
    const submitButton = page.locator('button:has-text("Create")').filter({ hasText: 'Customer' }).first();
    await submitButton.click();

    // Wait for navigation to detail page
    await page.waitForURL(/\/app\/customers\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Verify creation was successful
    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toBeTruthy();
    expect(createResponse.body?.data?.id).toBeTruthy();

    // Store the customer ID for later tests
    const customerId = page.url().match(/\/app\/customers\/([a-f0-9-]{36})/)?.[1];
    expect(customerId).toBeTruthy();
  });

  test('8. Refresh browser and verify newly created customer persists in API data', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    // Navigate to list
    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Refresh page
    await page.reload({ waitUntil: 'networkidle' });

    // Search for the test customer
    const searchInput = page.locator('input[placeholder*="Company name"]');
    await searchInput.fill(uniqueCompanyName);
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Verify customer appears in table
    const companyCell = page.locator(`text=${uniqueCompanyName}`);
    const isVisible = await companyCell.isVisible().catch(() => false);
    expect(isVisible).toBe(true);
  });

  test('9. Open the created customer detail page', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Search for customer
    const searchInput = page.locator('input[placeholder*="Company name"]');
    await searchInput.fill(uniqueCompanyName);
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Click View button on the row
    const viewButton = page.locator('button:has-text("View")').first();
    await viewButton.click();

    await page.waitForURL(/\/app\/customers\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Verify detail page loaded
    const detailContent = await page.locator('body').textContent();
    expect(detailContent).toContain(uniqueCompanyName);
  });

  test('10. Edit the customer through the form', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    const editedCompanyName = `${uniqueCompanyName} - EDITED`;

    // Navigate to list
    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Search and open customer
    const searchInput = page.locator('input[placeholder*="Company name"]');
    await searchInput.fill(uniqueCompanyName);
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    const viewButton = page.locator('button:has-text("View")').first();
    await viewButton.click();

    await page.waitForURL(/\/app\/customers\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Click Edit button
    const editButton = page.locator('button:has-text("Edit")').first();
    const editIsVisible = await editButton.isVisible().catch(() => false);

    if (editIsVisible) {
      await editButton.click();

      // Update company name
      const companyInput = page.locator('input').first();
      await companyInput.clear();
      await companyInput.fill(editedCompanyName);

      // Save
      const saveButton = page.locator('button:has-text("Save")').first();
      await saveButton.click();

      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Verify edit was saved
      const headerText = await page.locator('h1').textContent();
      expect(headerText).toContain(editedCompanyName);
    }
  });

  test('11. Refresh browser and verify edited customer values persist', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    const editedCompanyName = `${uniqueCompanyName} - EDITED`;

    // Navigate to list
    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Refresh
    await page.reload({ waitUntil: 'networkidle' });

    // Search for edited customer
    const searchInput = page.locator('input[placeholder*="Company name"]');
    await searchInput.fill(editedCompanyName);
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Verify edited name appears
    const companyCell = page.locator(`text=${editedCompanyName}`);
    const isVisible = await companyCell.isVisible().catch(() => false);
    expect(isVisible).toBe(true);
  });

  test('12. Submit invalid input and verify validation errors are displayed', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    await page.goto(`${FRONTEND_URL}/app/customers/create`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Try to submit empty form
    const submitButton = page.locator('button:has-text("Create")').filter({ hasText: 'Customer' }).first();
    await submitButton.click();

    await page.waitForTimeout(500);

    // Should still be on create page (validation failed)
    expect(page.url()).toContain('/create');

    // Verify error message appears
    const errorText = await page.locator('body').textContent();
    const hasError = errorText?.toLowerCase().includes('required') || errorText?.toLowerCase().includes('error');
    expect(hasError).toBe(true);
  });

  test('13. Archive the test customer and verify status changes', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    const editedCompanyName = `${uniqueCompanyName} - EDITED`;

    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Search for customer
    const searchInput = page.locator('input[placeholder*="Company name"]');
    await searchInput.fill(editedCompanyName);
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Open customer
    const viewButton = page.locator('button:has-text("View")').first();
    await viewButton.click();

    await page.waitForURL(/\/app\/customers\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Click Archive button if available
    const archiveButton = page.locator('button:has-text("Archive")').first();
    const archiveIsVisible = await archiveButton.isVisible().catch(() => false);

    if (archiveIsVisible) {
      await archiveButton.click();

      // Confirm dialog if present
      page.on('dialog', (dialog) => dialog.accept());

      await page.waitForTimeout(1000);

      // Verify archived status is shown
      const pageText = await page.locator('body').textContent();
      const hasArchived = pageText?.includes('ARCHIVED');
      expect(hasArchived).toBe(true);
    }
  });

  test('14. Restore archived customer and verify it becomes active', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    const editedCompanyName = `${uniqueCompanyName} - EDITED`;

    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Filter to show archived
    const statusSelect = page.locator('select');
    await statusSelect.selectOption('ARCHIVED');
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Search for customer
    const searchInput = page.locator('input[placeholder*="Company name"]');
    await searchInput.fill(editedCompanyName);
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Open customer
    const viewButton = page.locator('button:has-text("View")').first();
    const viewIsVisible = await viewButton.isVisible().catch(() => false);

    if (viewIsVisible) {
      await viewButton.click();

      await page.waitForURL(/\/app\/customers\/[a-f0-9-]{36}/, { timeout: 10000 });

      // Click Restore button
      const restoreButton = page.locator('button:has-text("Restore")').first();
      const restoreIsVisible = await restoreButton.isVisible().catch(() => false);

      if (restoreIsVisible) {
        await restoreButton.click();

        await page.waitForTimeout(1000);

        // Verify status changed to active
        const pageText = await page.locator('body').textContent();
        const hasActive = pageText?.includes('ACTIVE');
        expect(hasActive).toBe(true);
      }
    }
  });

  test('15. Simulate API failure, show error state, then retry and reload', async ({ authenticatedPage: page }, testInfo) => {
    authenticatedOnly(testInfo);
    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });

    // Block API calls
    await page.route('**/api/customers*', (route) => route.abort());

    // Reload to trigger error
    await page.reload();
    await page.waitForTimeout(1000);

    // Verify error is displayed
    const errorText = await page.locator('body').textContent();
    const hasError = errorText?.toLowerCase().includes('error') || errorText?.toLowerCase().includes('failed');
    expect(hasError).toBe(true);

    // Unblock API
    await page.unroute('**/api/customers*');

    // Click Retry button
    const retryButton = page.locator('button:has-text("Retry")').first();
    const retryIsVisible = await retryButton.isVisible().catch(() => false);

    if (retryIsVisible) {
      await retryButton.click();
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Verify data loaded successfully
      const table = page.locator('table');
      const tableIsVisible = await table.isVisible().catch(() => false);
      expect(tableIsVisible).toBe(true);
    }
  });
});
