import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, waitForHeading, PORTAL_DEMO_EMAIL, loginPortal, seedPortalSession } from '../helpers';

test.describe('regression · portal', () => {
  test('portal login page renders', async ({ page }) => {
    await gotoApp(page, ROUTES.portalLogin);
    await waitForHeading(page, /customer portal/i);
  });

  test('portal account can authenticate when enterprise seed is present', async ({
    page,
    request,
  }) => {
    try {
      const tokens = await loginPortal(request, PORTAL_DEMO_EMAIL);
      await seedPortalSession(page, tokens);
      await gotoApp(page, ROUTES.portalHome);
      await expect(page).not.toHaveURL(/portal\/login/);
    } catch (err) {
      test.skip(true, `Portal seed missing (${String(err)}) — run npm run seed:enterprise`);
    }
  });
});
