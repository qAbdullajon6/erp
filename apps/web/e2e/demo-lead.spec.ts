import { expect, test } from '@playwright/test';

/// The demo modal used to fake success without sending anything. This drives it
/// from the marketing page and asserts a real POST /leads happened.
test('the landing demo form submits a real lead', async ({ page }) => {
  test.setTimeout(300_000);

  const company = `E2E Logistics ${Date.now()}`;
  let leadStatus: number | null = null;
  page.on('response', (r) => {
    if (r.url().includes('/api/leads') && r.request().method() === 'POST') leadStatus = r.status();
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Wait for the button, not for a fixed number of seconds: the dev server
  // compiles this route on first request, which can take well over 3s and
  // otherwise fails whichever spec happens to touch the page first.
  // The button is server-rendered, so it is visible long before React has
  // hydrated and attached the listener that opens the modal. Waiting for
  // visibility is not waiting for interactivity — retry the click until the
  // dialog actually appears.
  const openDemo = page.getByRole('button', { name: /request a personalized demo/i }).first();
  await expect(openDemo).toBeVisible({ timeout: 60_000 });
  await expect(async () => {
    await openDemo.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });

  await page.locator('#d-name').fill('Jane Doe');
  await page.locator('#d-email').fill('jane@e2e.test');
  await page.locator('#d-company').fill(company);
  await page.locator('#d-phone').fill('+998 50 108 18 24');
  await page.locator('#d-msg').fill('12 trucks, 3 depots');

  await page.getByRole('button', { name: /request my demo/i }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/demo request received/i)).toBeVisible();
  expect(leadStatus, 'POST /leads should have been called and accepted').toBe(201);

  console.log(`submitted company: ${company}`);
});
