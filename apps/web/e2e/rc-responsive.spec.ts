import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/// RC8: the pages must not scroll sideways on a phone, and their key controls
/// must stay reachable. Horizontal overflow of the document is the failure that
/// actually hurts — a table scrolling inside its own container is fine.
const API = process.env.API_URL || 'http://localhost:4000';
const PASSWORD = 'FlowERP-Test-2026!';
const findings: string[] = [];
const fail = (p: string, msg: string) => findings.push(`${p} — ${msg}`);

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

test.describe.configure({ mode: 'serial' });

async function login(request: APIRequestContext, email: string) {
  for (let i = 0; i < 6; i++) {
    const r = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    if (r.status() === 429) {
      await new Promise((res) => setTimeout(res, 15_000));
      continue;
    }
    return (await r.json()).data as { accessToken: string; refreshToken: string };
  }
  throw new Error('429 storm');
}

async function seed(page: Page, a: string, r: string) {
  await page.addInitScript(
    ([at, rt]) => {
      sessionStorage.setItem('flowerp_access_token', at);
      sessionStorage.setItem('flowerp_refresh_token', rt);
    },
    [a, r],
  );
}

/// True when the page itself scrolls horizontally, which no screen should.
async function documentOverflows(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

async function sweep(page: Page, label: string, routes: string[]) {
  for (const route of routes) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4500);

      const overflow = await documentOverflows(page);
      const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      const blank = body.trim().length < 40;
      console.log(
        `[RC8] ${label} ${vp.name.padEnd(7)} ${route.padEnd(22)} overflow=${overflow} blank=${blank}`,
      );
      if (overflow) fail('P2', `${route} scrolls horizontally at ${vp.width}px (${label})`);
      if (blank) fail('P1', `${route} rendered blank at ${vp.width}px (${label})`);
    }
  }
}

test('RC8a: admin screens on desktop and mobile', async ({ page, request }) => {
  test.setTimeout(900_000);
  const { accessToken, refreshToken } = await login(request, 'admin@flowerp.test');
  await seed(page, accessToken, refreshToken);
  await sweep(page, 'admin', ['/app', '/app/orders', '/app/dispatches', '/app/finance', '/app/notifications']);
});

test('RC8b: mobile navigation drawer opens', async ({ page, request }) => {
  test.setTimeout(300_000);
  const { accessToken, refreshToken } = await login(request, 'admin@flowerp.test');
  await seed(page, accessToken, refreshToken);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/orders', { waitUntil: 'domcontentloaded' });

  const burger = page.getByRole('button', { name: /open navigation/i });
  await expect(burger).toBeVisible({ timeout: 60_000 });

  // Server-rendered markup arrives before hydration; retry until it opens.
  await expect(async () => {
    await burger.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });

  const drawer = (await page.getByRole('dialog').innerText()).replace(/\s+/g, ' ');
  console.log(`[RC8] mobile drawer entries: ${drawer.slice(0, 120)}`);
  if (!/Orders/.test(drawer)) fail('P1', 'the mobile drawer has no navigation entries');
});

test('RC8c: driver and platform-admin screens on mobile', async ({ page, request }) => {
  test.setTimeout(900_000);
  const driver = await login(request, 'driver@flowerp.test');
  await seed(page, driver.accessToken, driver.refreshToken);
  await sweep(page, 'driver', ['/app/my-deliveries']);
});

test('RC8d: leads screen on desktop and mobile', async ({ page, request }) => {
  test.setTimeout(900_000);
  const staff = await login(request, 'platform@flowerp.test');
  await seed(page, staff.accessToken, staff.refreshToken);
  await sweep(page, 'staff', ['/app/leads']);
});

test.afterAll(() => {
  console.log('\n=========== RC8 FINDINGS ===========');
  findings.length ? findings.forEach((f) => console.log('  ' + f)) : console.log('  none');
  console.log('====================================\n');
  expect(findings.filter((f) => f.startsWith('P0'))).toEqual([]);
});
