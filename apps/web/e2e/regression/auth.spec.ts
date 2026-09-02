import { test, expect, type Page } from '../fixtures/test';
import {
  ROUTES,
  gotoApp,
  waitForHeading,
  apiGet,
  loginAs,
  ROLE_EMAILS,
  passwordFor,
} from '../helpers';

/// The sign-in button stays disabled until React has hydrated, precisely so a
/// pre-hydration Enter can't natively submit the form. Anything testing
/// interactive behaviour has to wait for that, or it is testing the static
/// HTML.
async function gotoInteractiveLogin(page: Page) {
  await gotoApp(page, ROUTES.signIn);
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeEnabled({ timeout: 20_000 });
}

test.describe('regression · auth', () => {
  test('the sign-in page renders', async ({ page }) => {
    await gotoApp(page, ROUTES.signIn);
    await waitForHeading(page, /welcome back/i);
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  });

  /// Checking what you typed shouldn't require a mouse.
  test('the password reveal is reachable from the keyboard', async ({ page }) => {
    await gotoInteractiveLogin(page);
    const reveal = page.getByRole('button', { name: /show password/i });
    await reveal.focus();
    await expect(reveal).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('input#password')).toHaveAttribute('type', 'text');
  });

  /// The form has to submit on Enter from inside a field, not only by
  /// clicking the button — and a wrong password has to say so.
  test('Enter submits the form and a bad password is reported', async ({ page }) => {
    await gotoInteractiveLogin(page);
    await page.getByRole('textbox', { name: 'Email' }).fill('nobody@example.com');
    await page.locator('input#password').fill('definitely-wrong');
    await page.locator('input#password').press('Enter');
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('alert')).toContainText(/invalid/i);
    // The email survives a failed attempt; retyping it is pure friction.
    await expect(page.locator('#email')).toHaveValue('nobody@example.com');
  });

  /// Between first paint and hydration the form is plain HTML with nothing
  /// behind it, so an early Enter used to perform a native GET —
  /// `/login?email=...&password=hunter2` — putting a plaintext password in the
  /// address bar, in history, in the Referer of later requests, and in any
  /// analytics that records page URLs.
  test('typing before hydration never puts credentials in the URL', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'commit' });
    await page.locator('#email').waitFor({ state: 'attached', timeout: 15_000 });
    await page.locator('#email').fill('victim@example.com');
    await page.locator('#password').fill('hunter2-secret');
    await page.locator('#password').press('Enter');
    await page.waitForTimeout(1_500);

    expect(page.url()).not.toContain('password');
    expect(page.url()).not.toContain('victim%40example.com');
  });

  /// `/auth/sign-in` is what shipped, so it is in bookmarks and browser
  /// password vaults. It has to keep working.
  test('the old /auth/sign-in URL still reaches the login page', async ({ page }) => {
    await gotoApp(page, '/auth/sign-in');
    await expect(page).toHaveURL(/\/login/);
    await waitForHeading(page, /welcome back/i);
  });

  test('admin can authenticate via API', async ({ request }) => {
    const tokens = await loginAs(request, 'ADMIN');
    expect(tokens.accessToken).toBeTruthy();
    const me = await apiGet(request, '/auth/me', tokens.accessToken);
    expect(me.status).toBe(200);
  });

  test('authenticated admin reaches the dashboard', async ({ page, asAdmin }) => {
    void asAdmin;
    await gotoApp(page, ROUTES.home);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByTestId('dashboard')).toBeVisible();
  });

  /// Following a shared link to an order while signed out used to land you on
  /// the dashboard afterwards, with no clue what you had been sent to see.
  test('a deep link survives being bounced through sign-in', async ({ page }) => {
    await page.goto('/app/orders', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await expect(page).toHaveURL(/redirect=%2Fapp%2Forders/);
  });

  /// That `?redirect=` is attacker-controllable, and it is read by the one
  /// screen users are trained to type a password into. A link to
  /// `/login?redirect=https://evil.example` must not turn our sign-in page into
  /// a credible-looking hop to someone else's login form.
  test('a hostile ?redirect= cannot send a signed-in user off-site', async ({ page }) => {
    // Nothing should ever be asked of that host, not even a navigation that we
    // later bounce back from.
    const offSite: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).hostname.includes('evil.example')) offSite.push(r.url());
    });

    for (const hostile of ['https://evil.example/harvest', '//evil.example/harvest']) {
      await page.goto(`/login?redirect=${encodeURIComponent(hostile)}`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByRole('button', { name: /^sign in$/i })).toBeEnabled({
        timeout: 20_000,
      });

      await page.getByRole('textbox', { name: 'Email' }).fill(ROLE_EMAILS.ADMIN);
      await page.locator('input#password').fill(passwordFor('ADMIN'));
      await page.locator('input#password').press('Enter');

      // Land on the app first, then read the URL — asserting before the
      // navigation settles just re-reads the URL we arrived with.
      await expect(page).toHaveURL(/\/app/, { timeout: 20_000 });
      expect(page.url(), `honoured ${hostile}`).not.toContain('evil.example');

      await page.context().clearCookies();
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    }

    expect(offSite, 'requested the attacker-supplied host').toEqual([]);
  });
});
