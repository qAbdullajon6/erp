import { test } from '@playwright/test';
import { getTestSession } from './session';

const ROUTES = process.env.SHOT_ROUTES?.split(',') ?? ['/app'];
const WIDTH = Number(process.env.SHOT_WIDTH ?? 1920);
const HEIGHT = Number(process.env.SHOT_HEIGHT ?? 1080);
const NEEDS_AUTH = process.env.SHOT_NO_AUTH !== '1';

test('capture screenshots', async ({ page }) => {
  test.setTimeout(600_000);

  if (NEEDS_AUTH) {
    const { accessToken, refreshToken } = await getTestSession();
    await page.addInitScript(
      ([a, r]) => {
        sessionStorage.setItem('flowerp_access_token', a);
        sessionStorage.setItem('flowerp_refresh_token', r);
      },
      [accessToken, refreshToken],
    );
  }

  await page.setViewportSize({ width: WIDTH, height: HEIGHT });

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200));
  });

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const name = route.replace(/\//g, '_').replace(/^_/, '') || 'root';
    await page.screenshot({ path: `shots/${name}.png`, fullPage: process.env.SHOT_FULL === '1' });
    console.log(`shot: ${name}.png`);
  }

  if (errors.length) console.log('ERRORS: ' + [...new Set(errors)].slice(0, 6).join(' || '));
  else console.log('no page errors');
});
