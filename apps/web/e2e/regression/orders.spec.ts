import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, waitForHeading, apiGet } from '../helpers';

test.describe('regression · orders', () => {
  test('orders list loads for admin', async ({ page, asAdmin, adminTokens, request }) => {
    void asAdmin;
    const res = await apiGet(request, '/orders?limit=5', adminTokens.accessToken);
    expect(res.status).toBe(200);

    await gotoApp(page, ROUTES.orders);
    await waitForHeading(page, /orders/i);
  });
});
