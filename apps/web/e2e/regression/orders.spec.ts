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

  /// Same-day city delivery is ordinary work. The delivery picker used to
  /// disable the pickup day itself, so booking one was impossible from the UI
  /// before the server ever saw it.
  test('the delivery date picker offers the pickup day itself', async ({ page, asAdmin }) => {
    void asAdmin;
    await gotoApp(page, `${ROUTES.orders}?create=true`);

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible({ timeout: 30_000 });

    const [pickupPicker, deliveryPicker] = [
      sheet.getByTestId('orders-pickupDate'),
      sheet.getByTestId('orders-deliveryDate'),
    ];

    await pickupPicker.click();
    const today = page.getByRole('gridcell').filter({ has: page.locator('.rdp-day_today, [data-today="true"]') }).first();
    const pickupDay = (await today.count()) ? today : page.getByRole('gridcell').nth(15);
    const pickupLabel = (await pickupDay.innerText()).trim();
    await pickupDay.click();

    await deliveryPicker.click();
    const sameDay = page.getByRole('gridcell').filter({ hasText: new RegExp(`^${pickupLabel}$`) }).first();
    await expect(sameDay.locator('button')).toBeEnabled();
  });
});
