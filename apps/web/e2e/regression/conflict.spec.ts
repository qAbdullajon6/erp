import { test, expect } from '../fixtures/test';
import { API_URL, apiGet } from '../helpers';

test.describe('regression · conflict', () => {
  test('conflict batch endpoint returns for visible dispatches', async ({
    request,
    adminTokens,
  }) => {
    const list = await apiGet(request, '/dispatches?limit=5', adminTokens.accessToken);
    expect(list.status).toBe(200);
    const items = (list.json as { data: { items: Array<{ id: string }> } }).data.items;
    test.skip(items.length === 0, 'No dispatches seeded');

    const ids = items.map((i) => i.id);
    const response = await request.post(`${API_URL}/dispatches/conflicts/batch`, {
      headers: { Authorization: `Bearer ${adminTokens.accessToken}` },
      data: { ids },
    });
    expect(response.status()).toBeLessThan(300);
    const body = await response.json();
    expect(body.data).toBeTruthy();
  });
});
