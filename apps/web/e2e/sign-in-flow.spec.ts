import { expect, test } from '@playwright/test';

test('sign-in shows the real error, then succeeds', async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#email')).toBeVisible({ timeout: 60_000 });

  // The form is server-rendered, so it is visible and fillable before React
  // has hydrated. The submit button now stays disabled until it is, which
  // makes "enabled" the honest hydration signal — and means an early submit
  // can no longer escape as a native navigation.
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeEnabled({ timeout: 60_000 });

  const reveal = page.getByRole('button', { name: /show password/i });
  await reveal.click();
  await expect(page.locator('#password')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: /hide password/i }).click();
  await expect(page.locator('#password')).toHaveAttribute('type', 'password');

  // A wrong password must surface the real message on the first attempt — the
  // page used to read the hook's `error` state in the tick that set it, so it
  // always showed a stale null.
  await page.locator('#email').fill('admin@flowerp.test');
  await page.locator('#password').fill('definitely-wrong');
  await page.getByRole('button', { name: /^sign in$/i }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 30_000 });
  const message = (await alert.innerText()).trim();
  console.log('error shown: ' + message);
  expect(message.toLowerCase()).not.toContain('null');
  expect(message.toLowerCase()).not.toContain('undefined');

  await page.locator('#password').fill('FlowERP-Test-2026!');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
  console.log('signed in, url: ' + page.url());

  const token = await page.evaluate(() => sessionStorage.getItem('flowerp_access_token'));
  expect(token).toBeTruthy();
});
