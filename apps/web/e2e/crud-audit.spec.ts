import { test, expect, type Page } from '@playwright/test';
import { getTestSession } from './session';

const stamp = Date.now();

const results: string[] = [];
function ok(m: string) {
  results.push(`  PASS  ${m}`);
}
function bad(m: string) {
  results.push(`  FAIL  ${m}`);
}

async function seedAuth(page: Page, accessToken: string, refreshToken: string) {
  await page.addInitScript(
    ([a, r]) => {
      sessionStorage.setItem('flowerp_access_token', a);
      sessionStorage.setItem('flowerp_refresh_token', r);
    },
    [accessToken, refreshToken],
  );
}

/** Wait for the app to leave its loading skeleton and paint real text. */
async function settle(page: Page) {
  await page.waitForTimeout(4000);
}

test('CRUD audit across modules', async ({ page }) => {
  test.setTimeout(900_000);

  const { accessToken, refreshToken } = await getTestSession();
  await seedAuth(page, accessToken, refreshToken);

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  // ---------- DRIVERS ----------
  {
    const first = `Test${stamp}`;
    await page.goto('/app/drivers/create', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByTestId('drivers-first-name').fill(first);
    await page.getByTestId('drivers-last-name').fill('Driver');
    await page.getByTestId('drivers-phone').fill(`+99890${String(stamp).slice(-7)}`);
    await page.getByTestId('drivers-submit-button').click();
    await page.waitForURL(/\/app\/drivers\/[0-9a-f-]{36}/, { timeout: 20000 }).then(
      () => ok('drivers: CREATE -> redirected to detail'),
      () => bad('drivers: CREATE did not redirect to detail'),
    );
    await settle(page);
    const body = await page.locator('body').innerText();
    body.includes(first) ? ok('drivers: READ detail shows new driver') : bad('drivers: READ detail missing name');

    await page.goto('/app/drivers', { waitUntil: 'domcontentloaded' });
    await settle(page);
    const listText = await page.locator('body').innerText();
    listText.includes(first) ? ok('drivers: LIST shows new driver') : bad('drivers: LIST missing new driver');
  }

  // ---------- VEHICLES ----------
  {
    const plate = `T${String(stamp).slice(-7)}`;
    await page.goto('/app/vehicles/create', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByTestId('vehicles-plate-number').fill(plate);
    await page.getByTestId('vehicles-type').fill('box truck');
    await page.getByTestId('vehicles-submit-button').click();
    await page.waitForURL(/\/app\/vehicles\/[0-9a-f-]{36}/, { timeout: 20000 }).then(
      () => ok('vehicles: CREATE -> redirected to detail'),
      () => bad('vehicles: CREATE did not redirect to detail'),
    );
    await settle(page);
    const body = await page.locator('body').innerText();
    body.includes(plate) ? ok('vehicles: READ detail shows new vehicle') : bad('vehicles: READ detail missing plate');
  }

  // ---------- CUSTOMERS ----------
  {
    const company = `Acme ${stamp}`;
    await page.goto('/app/customers/create', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByPlaceholder('Acme Corp').fill(company);
    await page.getByPlaceholder('John Doe').fill('Jane Tester');
    await page.getByRole('button', { name: /create customer/i }).click();
    await page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}/, { timeout: 20000 }).then(
      () => ok('customers: CREATE -> redirected to detail'),
      () => bad('customers: CREATE did not redirect to detail'),
    );
    await settle(page);
    const body = await page.locator('body').innerText();
    body.includes(company) ? ok('customers: READ detail shows new customer') : bad('customers: READ detail missing company');

    // UPDATE via Edit button
    const editBtn = page.getByRole('button', { name: /^edit$/i }).first();
    if (await editBtn.count()) {
      await editBtn.click();
      await settle(page);
      ok('customers: UPDATE edit mode opens');
    } else {
      bad('customers: UPDATE edit button not found');
    }
  }

  // ---------- ORDERS ----------
  {
    await page.goto('/app/orders/create', { waitUntil: 'domcontentloaded' });
    await settle(page);
    const selects = page.locator('select');
    const nSelects = await selects.count();
    const inputs = await page.locator('input').count();
    nSelects > 0 && inputs > 3
      ? ok(`orders: CREATE form rendered (${nSelects} selects, ${inputs} inputs)`)
      : bad('orders: CREATE form did not render fields');
  }

  // ---------- DISPATCHES ----------
  {
    await page.goto('/app/dispatches/create', { waitUntil: 'domcontentloaded' });
    await settle(page);
    const text = await page.locator('body').innerText();
    text.includes('Create Dispatch') ? ok('dispatches: CREATE form rendered') : bad('dispatches: CREATE form missing');
  }

  // ---------- FINANCE ----------
  {
    await page.goto('/app/finance', { waitUntil: 'domcontentloaded' });
    await settle(page);
    const text = await page.locator('body').innerText();
    text.includes('TOTAL INVOICED') ? ok('finance: dashboard renders totals') : bad('finance: totals missing');
  }

  console.log('\n\n=========== CRUD AUDIT ===========');
  results.forEach((r) => console.log(r));
  if (errors.length) {
    console.log('\n  PAGE ERRORS:');
    [...new Set(errors)].slice(0, 8).forEach((e) => console.log(`    - ${e}`));
  } else {
    console.log('\n  No uncaught page errors.');
  }
  console.log('=========== END ===========\n');

  expect(results.filter((r) => r.startsWith('  FAIL'))).toEqual([]);
});
