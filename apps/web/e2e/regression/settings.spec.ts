import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, waitForHeading } from '../helpers';

test.describe('regression · settings', () => {
  test('settings page loads for admin', async ({ page, asAdmin }) => {
    void asAdmin;
    await gotoApp(page, ROUTES.settings);
    await waitForHeading(page, /settings/i);
  });
});
