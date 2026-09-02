import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, waitForHeading, waitForTestId } from '../helpers';

test.describe('regression · analytics', () => {
  test('dispatch analytics dashboard renders KPIs', async ({ page, asAdmin }) => {
    void asAdmin;
    await gotoApp(page, ROUTES.analytics);
    await waitForHeading(page, /dispatch analytics/i);
    await waitForTestId(page, 'dispatch-analytics-kpis');
  });
});
