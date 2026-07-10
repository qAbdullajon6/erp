import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/// RC7: token expiry and refresh under a real dashboard's request fan-out,
/// logout revocation, and what closing the tab does to the session.
const API = process.env.API_URL || 'http://localhost:4000';
const PASSWORD = 'FlowERP-Test-2026!';
const findings: string[] = [];
const fail = (p: string, msg: string) => findings.push(`${p} — ${msg}`);

test.describe.configure({ mode: 'serial' });

async function login(request: APIRequestContext, email = 'admin@flowerp.test') {
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

async function seed(page: Page, accessToken: string, refreshToken: string) {
  await page.addInitScript(
    ([a, r]) => {
      sessionStorage.setItem('flowerp_access_token', a);
      sessionStorage.setItem('flowerp_refresh_token', r);
    },
    [accessToken, refreshToken],
  );
}

test('RC7a: a dashboard-load fan-out spends exactly one refresh token', async ({ page, request }) => {
  test.setTimeout(300_000);
  const { refreshToken } = await login(request);

  // A stale access token, a live refresh token: what a user sees after leaving
  // the tab open past the 15-minute access-token lifetime.
  await seed(page, 'stale.access.token', refreshToken);

  const refreshCalls: number[] = [];
  const apiFailures: string[] = [];
  let refreshed = false;
  page.on('response', (r) => {
    const url = r.url();
    if (/\/api\/auth\/refresh$/.test(url)) {
      refreshCalls.push(r.status());
      if (r.status() === 200) refreshed = true;
    } else if (
      // The 401 that *triggers* the refresh is the whole point; only a failure
      // after the token has been exchanged means the replay did not work.
      refreshed &&
      /\/api\/(auth\/me|orders|customers|reports|notifications|finance)/.test(url) &&
      r.status() >= 400
    ) {
      apiFailures.push(`${r.status()} ${url.replace(/https?:\/\/[^/]+/, '')}`);
    }
  });

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12_000);

  console.log(`[RC7a] /auth/refresh calls: [${refreshCalls.join(', ')}]`);
  console.log(`[RC7a] landed on: ${page.url()}`);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  console.log(`[RC7a] dashboard rendered: ${/Command Center/.test(body)}`);
  console.log(`[RC7a] residual 4xx/5xx after refresh: ${apiFailures.length ? apiFailures.join(' | ') : 'none'}`);

  // The API rotates the presented refresh token, so a second concurrent refresh
  // would spend an already-revoked one and sign the user out.
  const successful = refreshCalls.filter((s) => s === 200).length;
  if (successful !== 1) fail('P0', `expected exactly one successful refresh, saw ${successful} (${refreshCalls})`);
  if (/\/auth\/sign-in/.test(page.url())) fail('P0', 'an expired access token still bounces the user to sign-in');
  if (!/Command Center/.test(body)) fail('P1', 'dashboard did not render after the refresh');
  if (apiFailures.length) fail('P1', `requests still failing after refresh: ${apiFailures.join(', ')}`);
});

test('RC7b: logout revokes the refresh token server-side', async ({ request }) => {
  test.setTimeout(300_000);
  const { accessToken, refreshToken } = await login(request);

  const out = await request.post(`${API}/auth/logout`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { refreshToken },
  });
  console.log(`[RC7b] logout: ${out.status()}`);
  if (out.status() >= 400) fail('P1', `logout returned ${out.status()}`);

  const reuse = await request.post(`${API}/auth/refresh`, { data: { refreshToken } });
  console.log(`[RC7b] reusing the revoked refresh token: ${reuse.status()} (expect 401)`);
  if (reuse.status() !== 401) fail('P0', `a logged-out refresh token still works: ${reuse.status()}`);
});

test('RC7c: a rotated refresh token cannot be replayed', async ({ request }) => {
  test.setTimeout(300_000);
  const { refreshToken } = await login(request);

  const first = await request.post(`${API}/auth/refresh`, { data: { refreshToken } });
  console.log(`[RC7c] first refresh: ${first.status()}`);

  const replay = await request.post(`${API}/auth/refresh`, { data: { refreshToken } });
  console.log(`[RC7c] replaying the same token: ${replay.status()} (expect 401)`);
  if (replay.status() !== 401) fail('P0', `a spent refresh token can be replayed: ${replay.status()}`);
});

test('RC7d: closing the tab ends the session', async ({ browser, request }) => {
  test.setTimeout(300_000);
  const { accessToken, refreshToken } = await login(request);

  const first = await browser.newContext();
  const page1 = await first.newPage();
  await seed(page1, accessToken, refreshToken);
  await page1.goto('/app', { waitUntil: 'domcontentloaded' });
  await page1.waitForTimeout(6000);
  console.log(`[RC7d] original tab url: ${page1.url()}`);
  await first.close();

  // sessionStorage is per-tab by design: the refresh token never survives a
  // closed tab, so a fresh one must land on sign-in rather than the dashboard.
  const second = await browser.newContext();
  const page2 = await second.newPage();
  await page2.goto('/app', { waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(6000);
  const url = page2.url();
  console.log(`[RC7d] fresh tab url: ${url}`);
  if (!/\/auth\/sign-in/.test(url)) fail('P1', `a fresh tab did not require sign-in, landed on ${url}`);
  await second.close();
});

test.afterAll(() => {
  console.log('\n=========== RC7 FINDINGS ===========');
  findings.length ? findings.forEach((f) => console.log('  ' + f)) : console.log('  none');
  console.log('====================================\n');
  expect(findings.filter((f) => f.startsWith('P0'))).toEqual([]);
});
