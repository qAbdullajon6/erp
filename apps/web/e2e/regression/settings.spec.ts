import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, waitForHeading } from '../helpers';

test.describe('regression · settings', () => {
  test('company admin can reach organization, members, and guarded removal', async ({ page, asAdmin }) => {
    void asAdmin;
    await gotoApp(page, ROUTES.settings);
    await waitForHeading(page, /settings/i);

    await page.getByRole('tab', { name: 'Organization' }).click();
    await expect(page.getByRole('heading', { name: 'Organization Profile' })).toBeVisible();

    await page.getByRole('tab', { name: 'Members' }).click();
    await expect(page.getByRole('button', { name: 'Invite Member' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();

    await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation.getByRole('heading', { name: /remove .+\\?/i })).toBeVisible();
    await expect(confirmation.getByRole('button', { name: 'Remove member' })).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).not.toBeVisible();
  });
});
