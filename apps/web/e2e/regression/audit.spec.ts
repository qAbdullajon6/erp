import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, apiGet } from '../helpers';

test.describe('regression · audit', () => {
  test('audit API and page load', async ({ page, asAdmin, adminTokens, request }) => {
    void asAdmin;
    const res = await apiGet(request, '/audit?limit=5', adminTokens.accessToken);
    expect(res.status).toBe(200);

    await gotoApp(page, ROUTES.audit);
    // The screen is called "Activity log" — the same words the nav entry that
    // reaches it uses. A loose /audit/i match passed on any stray occurrence.
    await expect(page.getByTestId('audit-logs-page')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Activity log' })).toBeVisible();
  });
});
