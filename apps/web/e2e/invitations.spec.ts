import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  API,
  FRONTEND,
  INVITEE_PASSWORD,
  acceptInvitation,
  adminSession,
  clearOutbox,
  createInvitation,
  expireInvitation,
  invitationRow,
  openMembersTab,
  registerOrganization,
  tokenFromAcceptUrl,
  uniqueEmail,
  waitForAcceptUrl,
} from './invitation-helpers';

/// End-to-end cover for the invitation system, driven only through the public
/// HTTP surface and the NODE_ENV=test-only TestSupportModule.
///
/// The raw token is never persisted (only its SHA-256 hash) and never returned
/// by any production endpoint — it exists solely inside the emailed accept URL.
/// So the suite reads the URL back out of the mail outbox, which is exactly the
/// path a real invitee takes.
test.describe.configure({ mode: 'serial' });

/// The invitee must never inherit the admin's session, so every public
/// invitation page runs in its own context.
async function guestPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test.beforeEach(async ({ request }) => {
  await clearOutbox(request);
});

test('1 — an admin invites a member, who accepts and signs in', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180_000);
  const email = uniqueEmail('john');

  // --- admin invites through the UI
  await openMembersTab(page);
  await page.getByRole('button', { name: 'Invite Member' }).click();
  await page.getByLabel('Email *').fill(email);
  await page.getByLabel('Role *').selectOption('DISPATCHER');
  await page.getByRole('button', { name: 'Send Invitation' }).click();

  await expect(page.getByText('Invitation sent')).toBeVisible();

  // The list refreshes itself off the mutation's invalidation — no reload.
  const row = invitationRow(page, email);
  await expect(row).toBeVisible();
  // `exact` matters: getByText is a case-insensitive substring match, so a
  // status word appearing anywhere in the row (e.g. in the address) would
  // otherwise also match the badge locator.
  await expect(row.getByText('Pending', { exact: true })).toBeVisible();

  // --- the invitee opens the link that was actually emailed
  const token = tokenFromAcceptUrl(await waitForAcceptUrl(request, email));
  const invitee = await guestPage(browser);

  await invitee.goto(`${FRONTEND}/invite/${token}`);
  await expect(invitee.getByText("You're invited")).toBeVisible();
  await expect(invitee.getByText(email)).toBeVisible();
  await expect(invitee.getByText('Dispatcher', { exact: true })).toBeVisible();

  await invitee.getByRole('link', { name: 'Accept invitation' }).click();
  await expect(invitee).toHaveURL(new RegExp(`/invite/${token}/accept`));

  await invitee.getByLabel('First name').fill('John');
  await invitee.getByLabel('Last name').fill('Rivera');
  await invitee.getByLabel('Password', { exact: true }).fill(INVITEE_PASSWORD);
  await invitee.getByRole('button', { name: 'Accept invitation' }).click();

  await expect(invitee.getByText('Invitation accepted successfully.')).toBeVisible();
  const signInLink = invitee.getByRole('link', { name: 'Go to Sign In' });
  await expect(signInLink).toBeVisible();

  // --- the invitee signs in with the password they just set
  await signInLink.click();
  await invitee.getByLabel('Work Email').fill(email);
  await invitee.getByLabel('Password', { exact: true }).fill(INVITEE_PASSWORD);
  await invitee.getByRole('button', { name: 'Sign In' }).click();

  await expect(invitee).toHaveURL(/\/app/);
  await expect(invitee.getByRole('button', { name: 'Settings', exact: true }).first()).toBeVisible();

  await invitee.context().close();
});

test('2 — an expired invitation cannot be accepted', async ({ request, browser }) => {
  const admin = await adminSession(request);
  const email = uniqueEmail('expired');

  const invitation = await createInvitation(request, admin, email);
  const token = tokenFromAcceptUrl(await waitForAcceptUrl(request, email));

  await expireInvitation(request, invitation.id);

  const invitee = await guestPage(browser);

  await invitee.goto(`${FRONTEND}/invite/${token}`);
  await expect(invitee.getByText('This invitation has expired')).toBeVisible();
  await expect(invitee.getByRole('link', { name: 'Accept invitation' })).toHaveCount(0);

  // The form itself refuses too — the preview is not the only gate.
  await invitee.goto(`${FRONTEND}/invite/${token}/accept`);
  await expect(invitee.getByText('This invitation has expired')).toBeVisible();
  await expect(invitee.getByRole('button', { name: 'Accept invitation' })).toHaveCount(0);

  await invitee.context().close();
});

test('3 — an already-accepted invitation cannot be reused', async ({ request, browser }) => {
  const admin = await adminSession(request);
  const email = uniqueEmail('reused');

  await createInvitation(request, admin, email);
  const token = tokenFromAcceptUrl(await waitForAcceptUrl(request, email));

  await acceptInvitation(request, token);

  const invitee = await guestPage(browser);
  await invitee.goto(`${FRONTEND}/invite/${token}`);
  await expect(invitee.getByText('This invitation has already been accepted')).toBeVisible();
  await expect(invitee.getByRole('link', { name: 'Accept invitation' })).toHaveCount(0);

  await invitee.context().close();
});

test('4 — an invitation revoked from the UI stops working', async ({ page, request, browser }) => {
  const admin = await adminSession(request);
  // The prefix deliberately avoids a status word: it lands in the row's email
  // cell, and a substring match would then collide with the badge locator.
  const email = uniqueEmail('to-cancel');

  await createInvitation(request, admin, email);
  const token = tokenFromAcceptUrl(await waitForAcceptUrl(request, email));

  await openMembersTab(page);
  const row = invitationRow(page, email);
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Revoke' }).click();
  await page.getByRole('button', { name: 'Revoke invitation' }).click();
  await expect(page.getByText('Invitation revoked')).toBeVisible();
  await expect(row.getByText('Revoked', { exact: true })).toBeVisible();

  const invitee = await guestPage(browser);
  await invitee.goto(`${FRONTEND}/invite/${token}`);
  await expect(invitee.getByText('This invitation has been revoked')).toBeVisible();
  await expect(invitee.getByRole('link', { name: 'Accept invitation' })).toHaveCount(0);

  await invitee.context().close();
});

test('5 — an invalid token is not found', async ({ browser }) => {
  const invitee = await guestPage(browser);

  await invitee.goto(`${FRONTEND}/invite/not-a-real-token`);
  await expect(invitee.getByText('Invitation not found')).toBeVisible();
  await expect(invitee.getByRole('link', { name: 'Accept invitation' })).toHaveCount(0);

  await invitee.context().close();
});

test('6 — Pending Invitations reflects invite, resend and revoke without a reload', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Prefix avoids any status word — see scenario 4.
  const email = uniqueEmail('list-refresh');

  await openMembersTab(page);
  await page.getByRole('button', { name: 'Invite Member' }).click();
  await page.getByLabel('Email *').fill(email);
  await page.getByLabel('Role *').selectOption('ACCOUNTANT');
  await page.getByRole('button', { name: 'Send Invitation' }).click();

  const row = invitationRow(page, email);
  await expect(row).toBeVisible();
  await expect(row.getByText('Pending', { exact: true })).toBeVisible();
  await expect(row.getByText('Accountant', { exact: true })).toBeVisible();

  // Resend rotates the token but must not change the row's state.
  await row.getByRole('button', { name: 'Resend' }).click();
  await expect(page.getByText('Invitation resent')).toBeVisible();
  await expect(row.getByText('Pending', { exact: true })).toBeVisible();

  await row.getByRole('button', { name: 'Revoke' }).click();
  await page.getByRole('button', { name: 'Revoke invitation' }).click();
  await expect(page.getByText('Invitation revoked')).toBeVisible();
  await expect(row.getByText('Revoked', { exact: true })).toBeVisible();

  // ...and it is persisted, not just optimistic UI.
  await page.reload();
  await page.getByRole('tab', { name: 'Members' }).click();
  await expect(invitationRow(page, email).getByText('Revoked', { exact: true })).toBeVisible();
});

test('7 — one organization cannot resend or revoke another organization\'s invitation', async ({
  request,
}) => {
  const orgA = await registerOrganization(request, `Org A ${Date.now()}`);
  const orgB = await registerOrganization(request, `Org B ${Date.now()}`);

  const invitation = await createInvitation(request, orgA, uniqueEmail('cross-tenant'));

  // Org B's admin, aimed at Org A's route: the controller's tenant assertion
  // refuses before any service call.
  const asOrgB = { Authorization: `Bearer ${orgB.accessToken}` };
  const base = `${API}/organizations/${orgA.organizationId}/invitations/${invitation.id}`;

  expect((await request.post(`${base}/resend`, { headers: asOrgB })).status()).toBe(403);
  expect((await request.post(`${base}/revoke`, { headers: asOrgB })).status()).toBe(403);
  expect(
    (
      await request.get(`${API}/organizations/${orgA.organizationId}/invitations`, {
        headers: asOrgB,
      })
    ).status(),
  ).toBe(403);

  // And aimed at their *own* route with Org A's invitation id, the scoped
  // lookup simply never finds it — 404, leaking nothing.
  const ownBase = `${API}/organizations/${orgB.organizationId}/invitations/${invitation.id}`;
  expect((await request.post(`${ownBase}/resend`, { headers: asOrgB })).status()).toBe(404);
  expect((await request.post(`${ownBase}/revoke`, { headers: asOrgB })).status()).toBe(404);

  // Org A's own admin is still able to act on it.
  const asOrgA = { Authorization: `Bearer ${orgA.accessToken}` };
  expect((await request.post(`${base}/revoke`, { headers: asOrgA })).status()).toBe(200);
});
