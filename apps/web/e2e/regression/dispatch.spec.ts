import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, waitForHeading, apiGet } from '../helpers';

test.describe('regression · dispatch', () => {
  test('dispatches list API and page load', async ({ page, asAdmin, adminTokens, request }) => {
    void asAdmin;
    const res = await apiGet(request, '/dispatches?limit=5', adminTokens.accessToken);
    expect(res.status).toBe(200);

    await gotoApp(page, ROUTES.dispatches);
    await waitForHeading(page, /dispatch/i);
  });
});
