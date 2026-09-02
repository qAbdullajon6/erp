import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, waitForHeading, apiGet } from '../helpers';

test.describe('regression · notifications', () => {
  test('bell API and notification center page load', async ({
    page,
    asAdmin,
    adminTokens,
    request,
  }) => {
    void asAdmin;
    const bell = await apiGet(
      request,
      '/notifications?limit=8&isArchived=false',
      adminTokens.accessToken,
    );
    expect(bell.status).toBe(200);

    const center = await apiGet(
      request,
      '/notification-center/notifications?isArchived=false&page=1&limit=20',
      adminTokens.accessToken,
    );
    expect(center.status).toBe(200);

    await gotoApp(page, ROUTES.notifications);
    await waitForHeading(page, /notifications/i);
    await expect(page.getByRole('button', { name: /retry/i })).toHaveCount(0);
  });
});
