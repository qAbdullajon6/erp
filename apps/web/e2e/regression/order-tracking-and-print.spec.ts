import { test, expect } from '../fixtures/test';
import { gotoApp } from '../helpers/navigation';
import { apiGet } from '../helpers/api';

interface OrderRow {
  id: string;
  vehicleId: string | null;
}

/// The map route accepts `?vehicleId=` and selects that vehicle, but both
/// "Map" links on the order screen dropped it. The operator landed on the
/// whole fleet and had to find the truck they had just been reading about.
test("the Map link from an order opens the map on that order's vehicle", async ({
  page,
  asAdmin,
  adminTokens,
  request,
}) => {
  void asAdmin;

  const orders = await apiGet(request, '/orders?limit=100', adminTokens.accessToken);
  expect(orders.status).toBe(200);
  const rows = (orders.json as { data: { items: OrderRow[] } }).data.items;
  const assigned = rows.find((o) => o.vehicleId);
  test.skip(!assigned, 'no order with an assigned vehicle in this workspace');

  await gotoApp(page, `/app/orders/${assigned!.id}`);

  await page.getByRole('link', { name: /^Map$/ }).first().click();

  await expect(page).toHaveURL(new RegExp(`vehicleId=${assigned!.vehicleId}`), {
    timeout: 30_000,
  });
});
