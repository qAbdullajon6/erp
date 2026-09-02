import { test, expect } from '../fixtures/test';
import { apiGet } from '../helpers';

test.describe('regression · documents', () => {
  test('order documents endpoint responds for a seeded order', async ({
    request,
    adminTokens,
  }) => {
    const list = await apiGet(request, '/orders?limit=1', adminTokens.accessToken);
    expect(list.status).toBe(200);
    const items = (list.json as { data: { items: Array<{ id: string }> } }).data.items;
    test.skip(items.length === 0, 'No orders seeded');

    const docs = await apiGet(
      request,
      `/orders/${items[0]!.id}/documents`,
      adminTokens.accessToken,
    );
    expect(docs.status).toBe(200);
  });
});
