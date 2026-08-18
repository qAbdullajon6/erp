import { test, expect } from '../fixtures/test';
import { gotoApp, waitForTestId } from '../helpers';

test.describe('regression · fleet tracking', () => {
  test('fleet tracking page loads for admin', async ({ page, asAdmin }) => {
    void asAdmin;
    await gotoApp(page, '/app/fleet-tracking');
    await waitForTestId(page, 'fleet-tracking-page');
    await expect(page.getByRole('heading', { name: /fleet tracking/i })).toBeVisible();
  });

  test('invalid vehicleId deep link fails closed without crashing', async ({ page, asAdmin }) => {
    void asAdmin;
    await gotoApp(page, '/app/fleet-tracking?vehicleId=00000000-0000-4000-8000-000000000099');
    await waitForTestId(page, 'fleet-tracking-page');
    await expect(page.getByRole('heading', { name: /fleet tracking/i })).toBeVisible();
  });
});
