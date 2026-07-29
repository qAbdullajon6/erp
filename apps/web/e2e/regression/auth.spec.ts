import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, waitForHeading, apiGet, loginAs } from '../helpers';

test.describe('regression · auth', () => {
  test('sign-in page renders', async ({ page }) => {
    await gotoApp(page, ROUTES.signIn);
    await waitForHeading(page, /sign in/i);
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('admin can authenticate via API', async ({ request }) => {
    const tokens = await loginAs(request, 'ADMIN');
    expect(tokens.accessToken).toBeTruthy();
    const me = await apiGet(request, '/auth/me', tokens.accessToken);
    expect(me.status).toBe(200);
  });

  test('authenticated admin reaches command center', async ({ page, asAdmin }) => {
    void asAdmin;
    await gotoApp(page, ROUTES.home);
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.getByRole('link', { name: /FlowERP/i }).first()).toBeVisible();
  });
});
