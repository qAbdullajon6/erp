import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, waitForHeading, waitForTestId } from '../helpers';

test.describe('regression · calendar', () => {
  test('calendar view loads with KPI strip', async ({ page, asAdmin }) => {
    void asAdmin;
    await gotoApp(page, ROUTES.calendar);
    await waitForHeading(page, /dispatch calendar/i);
    await waitForTestId(page, 'calendar-kpis');
    await expect(page.getByTestId('calendar-kpi-conflicts')).toBeVisible();
  });
});
