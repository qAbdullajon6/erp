import type { APIRequestContext, Page } from '@playwright/test';
import { API_URL } from './env';
import { ROLE_EMAILS, passwordFor, type StaffRole } from './roles';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const sessionCache = new Map<string, Promise<AuthTokens>>();

async function loginOnce(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<AuthTokens> {
  const response = await request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  if (!response.ok()) {
    throw new Error(`Login failed for ${email}: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  return {
    accessToken: body.data.accessToken as string,
    refreshToken: body.data.refreshToken as string,
  };
}

/** Memoized per-email login — avoids auth throttle during long suites. */
export function loginAs(
  request: APIRequestContext,
  role: StaffRole = 'ADMIN',
): Promise<AuthTokens> {
  const email = ROLE_EMAILS[role];
  const key = email;
  let pending = sessionCache.get(key);
  if (!pending) {
    pending = loginOnce(request, email, passwordFor(role));
    sessionCache.set(key, pending);
  }
  return pending;
}

/** Inject tokens before first navigation (app reads sessionStorage on boot). */
export async function seedBrowserSession(page: Page, tokens: AuthTokens): Promise<void> {
  await page.addInitScript(
    ([access, refresh]) => {
      sessionStorage.setItem('flowerp_access_token', access);
      sessionStorage.setItem('flowerp_refresh_token', refresh);
    },
    [tokens.accessToken, tokens.refreshToken] as [string, string],
  );
}

export async function loginPortal(
  request: APIRequestContext,
  email: string,
  password = passwordFor('PORTAL'),
  organizationSlug = 'flowerp-test-logistics',
): Promise<AuthTokens> {
  const response = await request.post(`${API_URL}/customer-portal/auth/login`, {
    data: { email, password, organizationSlug },
  });
  if (!response.ok()) {
    throw new Error(`Portal login failed for ${email}: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  return {
    accessToken: body.data.accessToken as string,
    refreshToken: body.data.refreshToken as string,
  };
}

export async function seedPortalSession(page: Page, tokens: AuthTokens): Promise<void> {
  await page.addInitScript(
    ([access, refresh]) => {
      sessionStorage.setItem('flowerp_portal_access_token', access);
      sessionStorage.setItem('flowerp_portal_refresh_token', refresh);
    },
    [tokens.accessToken, tokens.refreshToken] as [string, string],
  );
}
