import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, apiGet } from '../helpers';

test.describe('regression · audit', () => {
  test('audit API and page load', async ({ page, asAdmin, adminTokens, request }) => {
    void asAdmin;
    const res = await apiGet(request, '/audit?limit=5', adminTokens.accessToken);
    expect(res.status).toBe(200);

    await gotoApp(page, ROUTES.audit);
    await expect(page.getByText(/audit/i).first()).toBeVisible({ timeout: 30_000 });
  });
});
