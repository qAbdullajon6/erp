import { test, expect } from '../fixtures/test';
import { gotoApp } from '../helpers';

/// What a company sees the first time it signs in.
///
/// Before this, the answer was: the full operations dashboard reading zero
/// across every panel, and no indication of which of the eleven sidebar
/// entries to open first. The backend knew the five setup steps but nothing
/// had ever rendered them — `GET /onboarding/progress` had no callers and
/// would have thrown for all of them.

const API = process.env.API_URL ?? 'http://localhost:4210';

test('a brand new workspace is told what to do first', async ({ page, request }) => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const reg = await request.post(`${API}/auth/register`, {
    data: {
      email: `newco+${stamp}@example.com`,
      password: 'Password123!',
      firstName: 'New',
      lastName: 'Owner',
      organizationName: `Brand New Logistics ${stamp}`,
    },
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const { accessToken, refreshToken } = (await reg.json()).data;

  await page.goto('/');
  await page.evaluate(
    ([t, r]) => {
      sessionStorage.setItem('flowerp_access_token', t);
      sessionStorage.setItem('flowerp_refresh_token', r);
    },
    [accessToken, refreshToken] as [string, string],
  );

  await page.goto('/app');

  const checklist = page.getByTestId('setup-checklist');
  await expect(checklist).toBeVisible();
  await expect(checklist).toContainText('0/5');

  /// Each step has to actually go somewhere — a checklist that lists work
  /// without offering to start it is just a longer empty state.
  await checklist.getByRole('link', { name: /add your first customer/i }).click();
  await expect(page).toHaveURL(/\/app\/customers/);
});

test('the checklist reflects real data, not a stored flag', async ({ page, request }) => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const reg = await request.post(`${API}/auth/register`, {
    data: {
      email: `newco2+${stamp}@example.com`,
      password: 'Password123!',
      firstName: 'New',
      lastName: 'Owner',
      organizationName: `Second New Logistics ${stamp}`,
    },
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const { accessToken, refreshToken } = (await reg.json()).data;
  const auth = { Authorization: `Bearer ${accessToken}` };

  const customer = await request.post(`${API}/customers`, {
    headers: auth,
    data: { companyName: `First Customer ${stamp}`, contactName: 'Jane Doe' },
  });
  expect(customer.status(), await customer.text()).toBe(201);

  await page.goto('/');
  await page.evaluate(
    ([t, r]) => {
      sessionStorage.setItem('flowerp_access_token', t);
      sessionStorage.setItem('flowerp_refresh_token', r);
    },
    [accessToken, refreshToken] as [string, string],
  );
  await page.goto('/app');

  await expect(page.getByTestId('setup-checklist')).toContainText('1/5');
});

test('an established workspace never sees the checklist', async ({ page, asAdmin }) => {
  void asAdmin;
  await gotoApp(page, '/app');
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.getByTestId('setup-checklist')).toHaveCount(0);
});
