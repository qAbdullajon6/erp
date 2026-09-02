import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, waitForHeading } from '../helpers';

test.describe('regression · board', () => {
  test('dispatch board renders kanban regions', async ({ page, asAdmin }) => {
    void asAdmin;
    await gotoApp(page, ROUTES.board);
    await waitForHeading(page, /dispatch board/i);
    await expect(page.getByRole('button', { name: /^Board$/i })).toBeVisible();
  });
});
