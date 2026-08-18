import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, apiGet } from '../helpers';

test.describe('regression · timeline', () => {
  test('dispatch detail exposes timeline / conflict region', async ({
    page,
    asAdmin,
    adminTokens,
    request,
  }) => {
    void asAdmin;
    const list = await apiGet(request, '/dispatches?limit=1', adminTokens.accessToken);
    expect(list.status).toBe(200);
    const items = (list.json as { data: { items: Array<{ id: string }> } }).data.items;
    test.skip(items.length === 0, 'No dispatches seeded');

    await gotoApp(page, `/app/dispatches/${items[0]!.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/timeline|conflict|operations/i).first()).toBeVisible();
  });
});
