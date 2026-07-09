const API = process.env.API_URL || 'http://localhost:4000';

export const TEST_EMAIL = 'admin@flowerp.test';
export const TEST_PASSWORD = 'FlowERP-Test-2026!';

export interface TestSession {
  accessToken: string;
  refreshToken: string;
}

/// POST /auth/login is throttled to 5 requests/minute per IP — a deliberate
/// brute-force guard. Each spec logging in for itself blew through that budget
/// as soon as more than a couple ran in one batch, so the whole suite went red
/// on 429s that had nothing to do with the code under test. Playwright runs
/// these with a single worker, so one memoized login serves every spec.
let cached: Promise<TestSession> | null = null;

export function getTestSession(): Promise<TestSession> {
  if (!cached) {
    cached = (async () => {
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      });

      if (!response.ok) {
        throw new Error(`Test login failed: ${response.status} ${await response.text()}`);
      }

      const { data } = await response.json();
      return { accessToken: data.accessToken, refreshToken: data.refreshToken };
    })();
  }
  return cached;
}

/// Seeds the tokens the app reads on boot.
export async function seedSession(page: import('@playwright/test').Page, session: TestSession) {
  await page.addInitScript(
    ([a, r]) => {
      sessionStorage.setItem('flowerp_access_token', a);
      sessionStorage.setItem('flowerp_refresh_token', r);
    },
    [session.accessToken, session.refreshToken],
  );
}
