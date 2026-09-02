import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, apiGet, loginAs } from '../helpers';

test.describe('regression · driver', () => {
  test('admin is denied driver workspace UI', async ({ page, asAdmin }) => {
    void asAdmin;
    await gotoApp(page, ROUTES.driver);
    await expect(page.getByText(/don't have access|not available for your role/i)).toBeVisible({
      timeout: 30_000,
    });
  });

  test('driver can load /dispatches/my', async ({ request }) => {
    const tokens = await loginAs(request, 'DRIVER');
    const res = await apiGet(request, '/dispatches/my', tokens.accessToken);
    expect(res.status).toBe(200);
  });
});
