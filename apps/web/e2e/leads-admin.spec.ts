import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API = process.env.API_URL || 'http://localhost:4000';
const PASSWORD = 'FlowERP-Test-2026!';

/// Leads carry no organizationId, so a customer's ADMIN must not be able to
/// read them — only FlowERP staff (User.isPlatformAdmin). The sidebar hiding
/// the link is a courtesy; PlatformAdminGuard is the control, and this file
/// checks both.
test.describe.configure({ mode: 'serial' });

async function loginAs(request: APIRequestContext, email: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    if (response.status() !== 429) return response;
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error(`login for ${email} kept returning 429`);
}

async function signIn(page: Page, request: APIRequestContext, email: string) {
  const login = await loginAs(request, email);
  expect(login.status(), `login for ${email}`).toBe(200);
  const { accessToken, refreshToken } = (await login.json()).data;

  await page.addInitScript(
    ([a, r]) => {
      sessionStorage.setItem('flowerp_access_token', a);
      sessionStorage.setItem('flowerp_refresh_token', r);
    },
    [accessToken, refreshToken],
  );
  return accessToken as string;
}

test('a platform admin can triage leads', async ({ page, request }) => {
  test.setTimeout(300_000);
  await signIn(page, request, 'platform@flowerp.test');

  // Seed one lead through the public form's endpoint so the table is never empty.
  const company = `Triage Co ${Date.now()}`;
  const created = await request.post(`${API}/leads`, {
    data: { name: 'Jane Doe', email: 'jane@triage.test', company, phone: '+998 50 108 18 24' },
  });
  expect(created.status()).toBe(201);

  await page.goto('/app/leads', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('leads-table')).toBeVisible({ timeout: 60_000 });

  await expect(page.getByRole('button', { name: 'Leads', exact: true })).toBeVisible();

  // Find our row and move it NEW -> CONTACTED.
  await page.getByTestId('leads-search-input').fill(company);
  const row = page.getByTestId('lead-row').first();
  await expect(row).toContainText(company, { timeout: 30_000 });

  const statusSelect = row.getByTestId('lead-status-select');
  await expect(statusSelect).toHaveValue('NEW');
  await statusSelect.selectOption('CONTACTED');
  await expect(page.getByText(/lead moved to contacted/i)).toBeVisible({ timeout: 30_000 });

  // The change must survive a reload, i.e. it actually reached the database.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('leads-search-input').fill(company);
  await expect(page.getByTestId('lead-row').first().getByTestId('lead-status-select')).toHaveValue('CONTACTED', {
    timeout: 30_000,
  });
});

test('a customer admin cannot see or fetch leads', async ({ page, request }) => {
  test.setTimeout(300_000);
  // The customer organization's own ADMIN — the highest role a paying customer
  // can hold, and the account most likely to be mistaken for platform staff.
  const token = await signIn(page, request, 'admin@flowerp.test');

  // Hiding the sidebar link is a courtesy. This is the control.
  const forbidden = await request.get(`${API}/leads`, { headers: { Authorization: `Bearer ${token}` } });
  expect(forbidden.status(), 'GET /leads must be refused to a tenant admin').toBe(403);

  const stats = await request.get(`${API}/leads/stats`, { headers: { Authorization: `Bearer ${token}` } });
  expect(stats.status(), 'GET /leads/stats must be refused too').toBe(403);

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Settings', exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Leads', exact: true })).toHaveCount(0);
});

test('the public demo form still needs no session', async ({ request }) => {
  const response = await request.post(`${API}/leads`, {
    data: { name: 'Anon', email: 'anon@public.test', company: 'Public Co', phone: '1' },
  });
  expect(response.status()).toBe(201);
  expect(await response.json()).toMatchObject({ data: { received: true } });
});
