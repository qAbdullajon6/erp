import { test, expect } from '../fixtures/test';
import { ROUTES, gotoApp, waitForHeading } from '../helpers';

test.describe('regression · settings', () => {
  test('company admin can reach company identity, members, and guarded removal', async ({
    page,
    asAdmin,
  }) => {
    void asAdmin;
    await gotoApp(page, ROUTES.settings);
    await waitForHeading(page, /settings/i);

    const nav = page.getByRole('navigation', { name: 'Settings sections' });

    await nav.getByRole('button', { name: 'Company identity' }).click();
    await expect(page.getByRole('heading', { name: 'Company identity' })).toBeVisible();
    // The logo lives here rather than in a section of its own.
    await expect(page.getByLabel('Logo URL')).toBeVisible();

    await nav.getByRole('button', { name: 'Members' }).click();
    await expect(page.getByRole('button', { name: 'Invite Member' })).toBeVisible();
    await expect(page.getByRole('table').first()).toBeVisible();
    // Invitations share the section rather than hiding behind their own entry.
    await expect(page.getByRole('heading', { name: 'Invitations' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation.getByRole('heading', { name: /remove .+\?/i })).toBeVisible();
    await expect(confirmation.getByRole('button', { name: 'Remove member' })).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).not.toBeVisible();
  });

  test('a section is addressable, survives a reload, and is reachable from the user menu', async ({
    page,
    asAdmin,
  }) => {
    void asAdmin;

    // Deep link: the section named in the URL is the one that renders.
    await gotoApp(page, `${ROUTES.settings}?tab=members`);
    await expect(page.getByRole('button', { name: 'Invite Member' })).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Invite Member' })).toBeVisible();

    // Selecting a section puts it in the URL, so back returns to the previous one.
    await page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: 'General' })
      .click();
    await expect(page).not.toHaveURL(/tab=members/);
    await page.goBack();
    await expect(page).toHaveURL(/tab=members/);

    // "Your profile" and "Settings" in the user menu used to be the same link.
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Your profile' }).click();
    await expect(page).toHaveURL(/tab=profile/);
  });
});
