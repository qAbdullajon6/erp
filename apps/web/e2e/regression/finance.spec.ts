import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, waitForHeading, apiGet } from '../helpers';

test.describe('regression · finance', () => {
  test('finance page and invoices API load', async ({ page, asAdmin, adminTokens, request }) => {
    void asAdmin;
    const invoices = await apiGet(request, '/invoices?limit=5', adminTokens.accessToken);
    expect(invoices.status).toBe(200);

    await gotoApp(page, ROUTES.finance);
    await waitForHeading(page, /financial|finance|invoice/i);
  });
});
