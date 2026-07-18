import { randomUUID } from 'crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { TEST_PASSWORD, getTestSession, seedSession } from './session';

export const API = process.env.API_URL || 'http://localhost:4000';
export const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3002';

/// The password every invitee in this suite sets. Distinct from the seeded
/// admin's, so "logged in as the invitee" can never be a false positive.
export const INVITEE_PASSWORD = 'Invitee-Password-2026!';

/// Every response goes through the global TransformInterceptor, which wraps the
/// payload as `{ data }`. Errors come back as `{ error: { message } }`.
async function unwrap<T>(response: { json: () => Promise<unknown> }): Promise<T> {
  const body = (await response.json()) as { data?: T };
  return (body.data ?? body) as T;
}

/// A fresh address per run: the test database persists between runs, and an
/// invitation for an address that is already an open invite (or already a
/// member) is correctly rejected by the backend. Unique emails keep every test
/// independently re-runnable.
export function uniqueEmail(prefix = 'invitee'): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

// --- TestSupportModule (NODE_ENV=test only) ---------------------------------

export interface OutboxEmail {
  to: string;
  subject: string;
  acceptUrl: string;
}

export async function clearOutbox(request: APIRequestContext): Promise<void> {
  const response = await request.delete(`${API}/test/mail/outbox`);
  expect(
    response.status(),
    'DELETE /test/mail/outbox — is the API running with NODE_ENV=test?',
  ).toBe(200);
}

export async function readOutbox(request: APIRequestContext): Promise<OutboxEmail[]> {
  const response = await request.get(`${API}/test/mail/outbox`);
  expect(response.status(), 'GET /test/mail/outbox').toBe(200);
  return unwrap<OutboxEmail[]>(response);
}

/// Polls the outbox until the invitation email for `email` has been captured,
/// then returns its accept URL. No sleeps — expect.poll owns the retrying.
export async function waitForAcceptUrl(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  await expect
    .poll(
      async () => {
        const outbox = await readOutbox(request);
        return outbox.some((message) => message.to === email);
      },
      { message: `no invitation email was captured for ${email}`, timeout: 15_000 },
    )
    .toBe(true);

  const outbox = await readOutbox(request);
  const message = outbox.find((entry) => entry.to === email);
  if (!message) throw new Error(`no invitation email for ${email}`);
  return message.acceptUrl;
}

/// The accept URL is built from APP_PUBLIC_URL, which the test API need not
/// set (it is only required in production) — so it may be absolute or the bare
/// path `/invite/<token>`. Pulling the token out keeps the suite independent of
/// that configuration.
export function tokenFromAcceptUrl(acceptUrl: string): string {
  const token = acceptUrl.split('/invite/')[1];
  if (!token) throw new Error(`accept URL carries no token: ${acceptUrl}`);
  return token;
}

export async function expireInvitation(
  request: APIRequestContext,
  invitationId: string,
): Promise<void> {
  const response = await request.post(`${API}/test/invitations/${invitationId}/expire`);
  expect(response.status(), 'POST /test/invitations/:id/expire').toBe(200);
}

// --- Sessions ---------------------------------------------------------------

export interface OrgSession {
  email: string;
  accessToken: string;
  organizationId: string;
}

/// The seeded admin. Reuses the memoized login in session.ts — no spec re-implements
/// signing in.
export async function adminSession(request: APIRequestContext): Promise<OrgSession> {
  const { accessToken } = await getTestSession();
  const response = await request.get(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(response.status(), 'GET /auth/me for the seeded admin').toBe(200);

  const me = await unwrap<{ user: { email: string }; organization: { id: string } }>(response);
  return { email: me.user.email, accessToken, organizationId: me.organization.id };
}

/// Puts the seeded admin's tokens where the app reads them on boot.
export async function signInAsAdmin(page: Page): Promise<void> {
  await seedSession(page, await getTestSession());
}

/// Registration always creates a brand-new organization, which is exactly what
/// the cross-tenant test needs.
export async function registerOrganization(
  request: APIRequestContext,
  organizationName: string,
): Promise<OrgSession> {
  const email = uniqueEmail('owner');
  const response = await request.post(`${API}/auth/register`, {
    data: {
      email,
      password: TEST_PASSWORD,
      firstName: 'Org',
      lastName: 'Admin',
      organizationName,
    },
  });
  expect(response.status(), `register ${organizationName}`).toBe(201);

  const data = await unwrap<{ accessToken: string; organization: { id: string } }>(response);
  return { email, accessToken: data.accessToken, organizationId: data.organization.id };
}

// --- Invitation API ---------------------------------------------------------

export interface InvitationSummary {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
}

export async function createInvitation(
  request: APIRequestContext,
  session: OrgSession,
  email: string,
  role = 'DISPATCHER',
): Promise<InvitationSummary> {
  const response = await request.post(
    `${API}/organizations/${session.organizationId}/invitations`,
    {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: { email, role },
    },
  );
  expect(response.status(), `create invitation for ${email}`).toBe(201);
  return unwrap<InvitationSummary>(response);
}

/// Accepts through the public endpoint — used where the point of the test is the
/// state *after* acceptance, not the acceptance UI (which scenario 1 covers).
export async function acceptInvitation(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  const response = await request.post(`${API}/invite/accept`, {
    data: {
      token,
      firstName: 'Accepted',
      lastName: 'Invitee',
      password: INVITEE_PASSWORD,
    },
  });
  expect(response.status(), 'POST /invite/accept').toBe(200);
}

// --- Members settings page --------------------------------------------------

/// Opens Settings → Members as the seeded admin.
export async function openMembersTab(page: Page): Promise<void> {
  await signInAsAdmin(page);
  await page.goto(`${FRONTEND}/app/settings`);
  await page.getByRole('tab', { name: 'Members' }).click();
  await expect(page.getByRole('button', { name: 'Invite Member' })).toBeVisible();
}

/// The Pending Invitations row for an address. The invitee is not a member, so
/// their email appears in exactly one table.
export function invitationRow(page: Page, email: string) {
  return page.getByRole('row').filter({ hasText: email });
}
