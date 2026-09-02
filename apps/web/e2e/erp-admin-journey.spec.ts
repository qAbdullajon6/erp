import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Browser E2E: admin login → create customer → create order → invoice.
 *
 * Prerequisites: API on :4000, web on :3000.
 *
 * Run:
 *   cd apps/web
 *   SKIP_GLOBAL_SETUP=1 FRONTEND_URL=http://localhost:3000 \
 *     npx playwright test e2e/erp-admin-journey.spec.ts --project=unauthenticated
 *
 * Artifacts:
 *   - HTML report → apps/web/playwright-report/index.html
 *   - Failure screenshots/videos → apps/web/test-results/
 */

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';
const API = process.env.API_URL || 'http://localhost:4000';
const ADMIN_EMAIL = 'admin@flowerp.test';
const ADMIN_PASSWORD = 'FlowERP-Test-2026!';

test.describe.configure({ mode: 'serial' });

test.describe('ERP admin journey', () => {
  test.beforeEach(({}, testInfo) => {
    // Needs a clean session so the test exercises the real login form.
    test.skip(testInfo.project.name === 'authenticated', 'Run under --project=unauthenticated');
  });

  test('customer → order → invoice', async ({ page, request }) => {
    test.setTimeout(300_000);
    const stamp = Date.now();
    const companyName = `E2E Co ${stamp}`;
    const contactName = `E2E Contact ${stamp}`;
    const orderPrice = 1250;

    // ---------- 1. Open app + login ----------
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#email')).toBeVisible({ timeout: 60_000 });

    // Wait for hydration (password reveal is client-only).
    const reveal = page.getByRole('button', { name: /show password/i });
    await expect(async () => {
      await reveal.click();
      await expect(page.locator('#password')).toHaveAttribute('type', 'text', { timeout: 1_000 });
    }).toPass({ timeout: 60_000 });
    await page.getByRole('button', { name: /hide password/i }).click();

    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL(/\/(app|platform)/, { timeout: 60_000 });

    // Platform admins land on /platform — enter the ERP app shell.
    if (page.url().includes('/platform')) {
      await page.goto(`${FRONTEND}/app`, { waitUntil: 'domcontentloaded' });
    }
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    // ---------- 2. Create customer ----------
    await page.goto(`${FRONTEND}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    await page.getByRole('button', { name: /new customer/i }).click();
    await expect(page.getByRole('heading', { name: /new customer/i })).toBeVisible();

    await page.locator('#companyName').fill(companyName);
    await page.locator('#contactName').fill(contactName);
    await page.locator('#email').fill(`e2e-${stamp}@example.com`);
    await page.locator('#city').fill('Tashkent');
    await page.locator('#address').fill('1 Test Street');

    await page.getByRole('button', { name: /^create customer$/i }).click();

    // ---------- 3. Success toast ----------
    const customerToast = page.locator('[data-sonner-toast]').filter({ hasText: companyName });
    await expect(customerToast).toBeVisible({ timeout: 20_000 });
    await expect(customerToast).toContainText(/created/i);

    // Customer appears in the list
    await page.getByTestId('customers-search-input').fill(companyName);
    await expect(page.getByTestId('customers-table').getByText(companyName)).toBeVisible({
      timeout: 20_000,
    });

    // ---------- 4. Create order ----------
    await page.goto(`${FRONTEND}/app/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    await page.getByTestId('orders-new-button').click();
    await expect(page.getByTestId('orders-create-sheet')).toBeVisible();

    // Customer combobox
    await page.getByTestId('orders-customer-select').click();
    await page.getByPlaceholder(/search company/i).fill(companyName);
    await page.getByRole('option', { name: new RegExp(companyName, 'i') }).click();

    await page.getByTestId('orders-pickup-city').fill('Tashkent');
    await page.getByTestId('orders-pickup-address').fill(`Pickup ${stamp}`);
    await pickFutureDay(page, 'orders-pickupDate', 10);

    await page.getByTestId('orders-delivery-city').fill('Samarkand');
    await page.getByTestId('orders-delivery-address').fill(`Delivery ${stamp}`);
    await pickFutureDay(page, 'orders-deliveryDate', 18);

    await page.getByTestId('orders-cargo-description').fill(`E2E cargo ${stamp}`);
    await page.getByTestId('orders-price').fill(String(orderPrice));

    await page.getByTestId('orders-submit-button').click();

    // Duplicate / past-date confirms if shown
    await dismissOptionalConfirm(page, /create anyway|continue|confirm/i);

    const orderToast = page.locator('[data-sonner-toast]').filter({ hasText: /order .* created/i });
    await expect(orderToast).toBeVisible({ timeout: 30_000 });
    const orderToastText = (await orderToast.innerText()).replace(/\s+/g, ' ');
    const orderNumberMatch = orderToastText.match(/Order\s+(\S+)\s+created/i);
    expect(orderNumberMatch?.[1]).toBeTruthy();
    const orderNumber = orderNumberMatch![1];

    // ---------- 5. Order appears in table ----------
    await expect(page).toHaveURL(/\/app\/orders/, { timeout: 15_000 });
    // New drafts land on Needs Action tab
    await page.getByRole('tab', { name: /needs action/i }).click().catch(() => {});
    await page.getByPlaceholder(/search orders/i).fill(orderNumber);
    await expect(page.getByTestId('order-row').filter({ hasText: orderNumber }).first()).toBeVisible({
      timeout: 30_000,
    });

    // Resolve order id (search API) and open detail
    const token = await page.evaluate(() => sessionStorage.getItem('flowerp_access_token'));
    expect(token).toBeTruthy();
    const listed = await request.get(`${API}/orders?search=${encodeURIComponent(orderNumber)}&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = await listed.json();
    const orderId = listBody.data?.items?.[0]?.id as string | undefined;
    expect(orderId, `Order ${orderNumber} not found via API`).toBeTruthy();

    await page.goto(`${FRONTEND}/app/orders/${orderId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(new RegExp(`/app/orders/${orderId}`), { timeout: 30_000 });

    // ---------- 6. Deliver via API (invoice requires DELIVERED) ----------
    await deliverOrder(request, token!, orderId!);

    // ---------- 7. Generate invoice in UI ----------
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    const generateBtn = page.getByRole('button', { name: /generate invoice/i });
    await expect(generateBtn.first()).toBeVisible({ timeout: 20_000 });
    await generateBtn.first().click();

    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /invoice created/i })).toBeVisible({
      timeout: 20_000,
    });

    // Open invoice detail
    const openInvoice = page.getByRole('button', { name: /open invoice/i });
    await expect(openInvoice).toBeVisible({ timeout: 15_000 });
    await openInvoice.click();

    // ---------- 8. Verify invoice total ----------
    await expect(page.getByText(/total/i).first()).toBeVisible({ timeout: 15_000 });

    const invList = await request.get(`${API}/invoices?orderId=${orderId}&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const invBody = await invList.json();
    const invoice = invBody.data?.items?.[0];
    expect(invoice).toBeTruthy();
    expect(Number(invoice.totalAmount)).toBe(orderPrice);

    // Sheet shows formatted money for the total
    await expect(page.getByText(/\$1,250|1[,.]250|USD\s*1,?250/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

async function pickFutureDay(page: Page, testId: string, day: number) {
  await page.getByTestId(testId).click();
  const popover = page.locator('[data-radix-popper-content-wrapper]').last();
  await expect(popover).toBeVisible({ timeout: 5_000 });

  const nextMonth = popover.getByRole('button', { name: /next month/i });
  if (await nextMonth.isVisible().catch(() => false)) {
    await nextMonth.click();
    await nextMonth.click();
  }

  // CalendarDayButton sets data-day; the visible label is the day number.
  const dayBtn = popover.locator('button[data-day]').filter({ hasText: new RegExp(`^${day}$`) }).first();
  await expect(dayBtn).toBeVisible({ timeout: 10_000 });
  await dayBtn.click();
}

async function dismissOptionalConfirm(page: Page, confirmName: RegExp) {
  const dialog = page.getByRole('alertdialog');
  if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await dialog.getByRole('button', { name: confirmName }).click().catch(async () => {
      await dialog.getByRole('button').last().click();
    });
  }
}

/** Walk order to DELIVERED using server-declared transitions (ADR-001). */
async function deliverOrder(request: APIRequestContext, token: string, orderId: string) {
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const pending = await request.post(`${API}/orders/${orderId}/status`, {
    headers: auth,
    data: { status: 'PENDING' },
  });
  expect(pending.ok(), `PENDING failed: ${pending.status()} ${await pending.text()}`).toBeTruthy();

  const driversRes = await request.get(`${API}/drivers?status=ACTIVE&limit=1`, { headers: auth });
  const vehiclesRes = await request.get(`${API}/vehicles?status=AVAILABLE&limit=1`, { headers: auth });
  const drivers = (await driversRes.json()).data?.items ?? [];
  const vehicles = (await vehiclesRes.json()).data?.items ?? [];
  expect(drivers.length, 'Need an ACTIVE driver in the seed DB').toBeGreaterThan(0);
  expect(vehicles.length, 'Need an AVAILABLE vehicle in the seed DB').toBeGreaterThan(0);

  const assign = await request.post(`${API}/orders/${orderId}/assign`, {
    headers: auth,
    data: { driverId: drivers[0].id, vehicleId: vehicles[0].id },
  });
  expect(assign.ok(), `assign failed: ${assign.status()} ${await assign.text()}`).toBeTruthy();

  for (let i = 0; i < 10; i++) {
    const current = (await (await request.get(`${API}/orders/${orderId}`, { headers: auth })).json()).data as {
      status: string;
      allowedTransitions: string[];
    };
    if (current.status === 'DELIVERED') return;
    const next = current.allowedTransitions.find((s) => s !== 'CANCELLED');
    if (!next) break;
    const step = await request.post(`${API}/orders/${orderId}/status`, {
      headers: auth,
      data: { status: next },
    });
    expect(step.ok(), `${next} failed: ${step.status()} ${await step.text()}`).toBeTruthy();
  }

  const final = (await (await request.get(`${API}/orders/${orderId}`, { headers: auth })).json()).data;
  expect(final.status).toBe('DELIVERED');
}
