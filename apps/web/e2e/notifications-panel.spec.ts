import { expect, test } from '@playwright/test';
import { getTestSession } from './session';

test('notification panel opens and renders', async ({ page }) => {
  test.setTimeout(300_000);

  const { accessToken, refreshToken } = await getTestSession();
  await page.addInitScript(
    ([a, r]) => {
      sessionStorage.setItem('flowerp_access_token', a);
      sessionStorage.setItem('flowerp_refresh_token', r);
    },
    [accessToken, refreshToken],
  );
  await page.setViewportSize({ width: 1600, height: 950 });

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  await page.goto('/app', { waitUntil: 'domcontentloaded' });

  const bell = page.getByRole('button', { name: /notifications/i }).first();
  await expect(bell).toBeVisible({ timeout: 60_000 });

  // Server-rendered markup arrives before React hydrates; retry until the
  // slide-over actually opens.
  await expect(async () => {
    await bell.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });

  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'shots/notifications-panel.png' });

  const panel = page.getByRole('dialog');
  const box = await panel.boundingBox();
  console.log(`panel width: ${Math.round(box?.width ?? 0)}px`);

  const text = (await panel.innerText()).replace(/\s+/g, ' ');
  console.log(`panel text: ${text.slice(0, 220)}`);

  console.log(errors.length ? `ERRORS: ${[...new Set(errors)].join(' || ')}` : 'no page errors');
  expect(errors).toEqual([]);
});
