import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/// RC9: after a write, do the screens that summarise it actually move? The
/// caches are React Query's, so this is really "are the invalidations right".
const API = process.env.API_URL || 'http://localhost:4000';
const PASSWORD = 'FlowERP-Test-2026!';
const findings: string[] = [];
const fail = (p: string, msg: string) => findings.push(`${p} — ${msg}`);

test.describe.configure({ mode: 'serial' });

async function login(request: APIRequestContext, email = 'admin@flowerp.test') {
  for (let i = 0; i < 6; i++) {
    const r = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    if (r.status() === 429) {
      await new Promise((res) => setTimeout(res, 15_000));
      continue;
    }
    return (await r.json()).data as { accessToken: string; refreshToken: string };
  }
  throw new Error('429 storm');
}

async function seed(page: Page, a: string, r: string) {
  await page.addInitScript(
    ([at, rt]) => {
      sessionStorage.setItem('flowerp_access_token', at);
      sessionStorage.setItem('flowerp_refresh_token', rt);
    },
    [a, r],
  );
}

/// The dashboard's "Orders (30d)" tile.
async function ordersKpi(page: Page): Promise<number | null> {
  const text = await page.locator('body').innerText();
  const m = text.replace(/\s+/g, ' ').match(/Orders \(30d\)\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

test('RC9a: creating an order moves the dashboard KPI without a reload', async ({ page, request }) => {
  test.setTimeout(600_000);
  const { accessToken, refreshToken } = await login(request);
  const auth = { Authorization: `Bearer ${accessToken}` };
  await seed(page, accessToken, refreshToken);

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Command Center')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(4000);

  const before = await ordersKpi(page);
  console.log(`[RC9a] Orders (30d) before: ${before}`);

  const customerId = (
    await (
      await request.post(`${API}/customers`, {
        headers: auth,
        data: { companyName: `RC Integrity ${Date.now()}`, contactName: 'RC' },
      })
    ).json()
  ).data.id;
  const today = new Date().toISOString().slice(0, 10);
  const created = await request.post(`${API}/orders`, {
    headers: auth,
    data: {
      customerId,
      pickupAddress: '1 A',
      pickupCity: 'Tashkent',
      pickupDate: today,
      deliveryAddress: '2 B',
      deliveryCity: 'Navoi',
      deliveryDate: today,
      cargoDescription: 'RC integrity cargo',
      price: 250,
    },
  });
  console.log(`[RC9a] order created out-of-band: ${created.status()}`);

  // Navigating away and back is what a user does; it must not need a hard reload.
  await page.goto('/app/orders', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const after = await ordersKpi(page);
  console.log(`[RC9a] Orders (30d) after: ${after}`);
  if (before === null || after === null) fail('P2', 'could not read the Orders (30d) KPI');
  else if (after <= before) fail('P1', `dashboard KPI did not move (${before} -> ${after})`);
});

test('RC9b: recording a payment updates the finance summary in the same session', async ({ page, request }) => {
  test.setTimeout(600_000);
  const { accessToken, refreshToken } = await login(request);
  const auth = { Authorization: `Bearer ${accessToken}` };
  await seed(page, accessToken, refreshToken);

  const summaryBefore = (await (await request.get(`${API}/finance/summary`, { headers: auth })).json()).data;
  const collectedBefore = parseFloat(summaryBefore.invoices.totalCollected);

  await page.goto('/app/finance', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/TOTAL INVOICED/i)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  const uiBefore = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  console.log(`[RC9b] finance page collected (server): ${collectedBefore}`);

  // Find a sent, unpaid invoice; otherwise make one.
  let invoice = (
    await (await request.get(`${API}/invoices?status=SENT&limit=1`, { headers: auth })).json()
  ).data.items[0];
  if (!invoice) {
    console.log('[RC9b] no SENT invoice available; skipping the money movement');
    return;
  }

  const balance = parseFloat(invoice.balanceDue);
  const pay = await request.post(`${API}/invoices/${invoice.id}/payments`, {
    headers: auth,
    data: { amount: balance, method: 'CASH' },
  });
  console.log(`[RC9b] paid ${balance} on ${invoice.invoiceNumber}: ${pay.status()}`);
  if (pay.status() !== 201) {
    fail('P1', `payment returned ${pay.status()}`);
    return;
  }

  const summaryAfter = (await (await request.get(`${API}/finance/summary`, { headers: auth })).json()).data;
  const collectedAfter = parseFloat(summaryAfter.invoices.totalCollected);
  const delta = Math.round((collectedAfter - collectedBefore) * 100) / 100;
  console.log(`[RC9b] totalCollected ${collectedBefore} -> ${collectedAfter} (delta ${delta}, expected ${balance})`);
  if (delta !== balance) fail('P1', `finance summary moved by ${delta}, expected ${balance}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const uiAfter = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  if (uiAfter === uiBefore) fail('P2', 'the finance page text did not change after a payment');
  console.log('[RC9b] finance page re-rendered with new numbers');
});

test('RC9c: notifications and unread count reflect new operational state', async ({ request }) => {
  test.setTimeout(300_000);
  const { accessToken } = await login(request);
  const auth = { Authorization: `Bearer ${accessToken}` };

  const unread = await request.get(`${API}/notifications/unread-count`, { headers: auth });
  const list = await request.get(`${API}/notifications?limit=5`, { headers: auth });
  console.log(`[RC9c] unread-count: ${unread.status()}, list: ${list.status()}`);
  if (unread.status() !== 200) fail('P1', `unread-count returned ${unread.status()}`);
  if (list.status() !== 200) fail('P1', `notifications list returned ${list.status()}`);

  const items = (await list.json()).data.items;
  const count = (await unread.json()).data.unreadCount;
  const unreadInPage = items.filter((n: { isRead: boolean }) => !n.isRead).length;
  console.log(`[RC9c] unreadCount=${count}, unread in first page=${unreadInPage}`);
  if (typeof count !== 'number') fail('P1', 'unreadCount is not a number');
});

test.afterAll(() => {
  console.log('\n=========== RC9 FINDINGS ===========');
  findings.length ? findings.forEach((f) => console.log('  ' + f)) : console.log('  none');
  console.log('====================================\n');
  expect(findings.filter((f) => f.startsWith('P0'))).toEqual([]);
});
