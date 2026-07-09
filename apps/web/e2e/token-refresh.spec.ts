import { expect, test } from '@playwright/test';
import { getTestSession } from './session';

/// Regression for the "sitting on the dashboard silently logs you out" bug:
/// the access token expires after 15 minutes and nothing ever spent the
/// refresh token, so the next request 401'd and wiped the session.
///
/// An expired token and a structurally-invalid one both 401, so a junk access
/// token stands in for expiry without waiting 15 minutes.
test('an expired access token is refreshed instead of logging the user out', async ({ page }) => {
  test.setTimeout(300_000);

  const { refreshToken } = await getTestSession();

  await page.addInitScript(
    ([stale, refresh]) => {
      sessionStorage.setItem('flowerp_access_token', stale);
      sessionStorage.setItem('flowerp_refresh_token', refresh);
    },
    ['not.a.valid.token', refreshToken],
  );

  const refreshCalls: number[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/auth/refresh')) refreshCalls.push(r.status());
  });

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  expect(refreshCalls, 'the app should have exchanged the refresh token').toContain(200);
  await expect(page).not.toHaveURL(/\/auth\/sign-in/);

  const body = await page.locator('body').innerText();
  expect(body).toContain('Command Center');

  // The rotated tokens must be persisted, otherwise the next request 401s again.
  const stored = await page.evaluate(() => sessionStorage.getItem('flowerp_access_token'));
  expect(stored).not.toBe('not.a.valid.token');
  expect(stored).toBeTruthy();
});
