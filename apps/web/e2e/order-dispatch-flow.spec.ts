import { expect, test } from '@playwright/test';
import { getTestSession } from './session';

const log: string[] = [];
/** Statuses returned by POST /orders and POST /dispatches, in call order. */
const postStatuses: Record<string, number> = {};

test('order + dispatch creation flow', async ({ page }) => {
  test.setTimeout(600_000);
  const { accessToken, refreshToken } = await getTestSession();
  await page.addInitScript(
    ([a, r]) => {
      sessionStorage.setItem('flowerp_access_token', a);
      sessionStorage.setItem('flowerp_refresh_token', r);
    },
    [accessToken, refreshToken],
  );

  page.on('pageerror', (e) => log.push(`PAGEERROR: ${e.message.slice(0, 200)}`));
  page.on('response', async (r) => {
    const m = r.request().method();
    if (r.url().includes('/api/orders') && m === 'POST') {
      postStatuses.orders = r.status();
      log.push(`POST /orders -> ${r.status()}`);
    }
    if (r.url().includes('/api/dispatches') && m === 'POST') {
      postStatuses.dispatches = r.status();
      log.push(`POST /dispatches -> ${r.status()}`);
    }
  });

  // ---- CREATE ORDER ----
  await page.goto('/app/orders/create', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const custSelect = page.getByTestId('orders-customer-select');
  const options = await custSelect.locator('option').all();
  const firstReal = await options[1].getAttribute('value');
  await custSelect.selectOption(firstReal!);

  await page.getByTestId('orders-pickup-address').fill('12 Pickup St');
  await page.getByTestId('orders-pickup-city').fill('Tashkent');
  await page.getByTestId('orders-pickup-date').fill('2026-08-01');
  await page.getByTestId('orders-delivery-address').fill('99 Delivery Ave');
  await page.getByTestId('orders-delivery-city').fill('Samarkand');
  await page.getByTestId('orders-delivery-date').fill('2026-08-05');
  await page.getByTestId('orders-cargo-description').fill('E2E test cargo');
  await page.getByTestId('orders-price').fill('4200');
  await page.getByTestId('orders-submit-button').click();

  await page
    .waitForURL(/\/app\/orders\/[0-9a-f-]{36}/, { timeout: 25000 })
    .then(() => log.push('ORDER CREATE: redirected to detail OK'))
    .catch(() => log.push(`ORDER CREATE: no redirect, url=${page.url()}`));
  await page.waitForTimeout(3000);

  // ---- CREATE DISPATCH ----
  await page.goto('/app/dispatches/create', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const selects = page.locator('select');
  const count = await selects.count();
  log.push(`dispatch form selects=${count}`);

  for (let i = 0; i < count; i++) {
    const s = selects.nth(i);
    const opts = await s.locator('option').all();
    // Every picker must be populated: the order dropdown was silently empty
    // when useOrdersList did not auto-fetch, making dispatch creation
    // impossible from the UI.
    expect(opts.length, `dispatch select #${i} has no selectable options`).toBeGreaterThan(1);
    const v = await opts[1].getAttribute('value');
    await s.selectOption(v!);
  }

  await page.getByRole('button', { name: /create dispatch/i }).click();
  await page.waitForTimeout(6000);
  log.push(`dispatch url after submit: ${page.url()}`);
  const txt = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  log.push(`dispatch page text: ${txt.slice(0, 250)}`);

  console.log('\n=========== ORDER/DISPATCH FLOW ===========');
  log.forEach((l) => console.log('  ' + l));
  console.log('=========== END ===========\n');

  expect(postStatuses.orders, 'POST /orders should create the order').toBe(201);
  expect(postStatuses.dispatches, 'POST /dispatches should create the dispatch').toBe(201);
  await expect(page).toHaveURL(/\/app\/dispatches\/[0-9a-f-]{36}/);
});
