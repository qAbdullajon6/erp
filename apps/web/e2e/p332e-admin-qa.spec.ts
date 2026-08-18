import { expect, test, type Page } from '@playwright/test';

const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
const API = process.env.API_URL || 'http://127.0.0.1:4000';
const PASSWORD = 'FlowERP-Test-2026!';
const blockers: { area: string; detail: string }[] = [];
const fail = (area: string, detail: string) => blockers.push({ area, detail });

async function login(page: Page, email = 'admin@flowerp.test') {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
      continue;
    }
    const body = await res.json();
    const token = (body.data ?? body).accessToken as string;
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => sessionStorage.setItem('flowerp_access_token', t), token);
    await page.goto(`${FRONTEND}/app`, { waitUntil: 'domcontentloaded' });
    return token;
  }
  throw new Error('login rate limited');
}

async function apiGet(token: string, path: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  return body.data ?? body;
}

test('admin acceptance QA', async ({ page }) => {
  test.setTimeout(300_000);
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  const token = await login(page);
  const list = await apiGet(token, '/dispatches?limit=50');
  const ids = (list.items ?? []).map((d: { id: string }) => d.id);
  const batchRaw = await fetch(`${API}/dispatches/conflicts/batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const batchBody = await batchRaw.json();
  const batch = batchBody.data ?? batchBody;
  const targetId = ids.find((id: string) => (batch[id]?.summary?.unresolved ?? 0) > 0) ?? ids[0];
  const target = list.items.find((d: { id: string }) => d.id === targetId);
  const url = `${FRONTEND}/app/dispatches/${targetId}`;
  const detail = await apiGet(token, `/dispatches/${targetId}`);
  const pickupDay = (detail.pickupDateScheduled as string).slice(0, 10);

  // 1 Detail
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  if (await page.getByText('Failed to load conflicts').isVisible().catch(() => false)) fail('1', 'Failed to load conflicts');
  if (!(await page.locator('aside').getByText(/^Conflicts/).isVisible({ timeout: 15000 }).catch(() => false))) fail('1', 'Panel missing');
  if (!(await page.locator('aside').getByText(/recommend|inspection|vehicle|driver/i).first().isVisible().catch(() => false))) fail('1', 'Recommendations missing');

  // 2 Board
  await page.goto(`${FRONTEND}/app/dispatches/board`, { waitUntil: 'domcontentloaded' });
  const card = page.getByTestId(`dispatch-card-${target.dispatchNumber}`);
  if (!(await card.getByTestId('dispatch-conflict-badge').isVisible({ timeout: 15000 }).catch(() => false))) fail('2', 'Board badge missing');

  // 3 Calendar
  await page.goto(`${FRONTEND}/app/dispatches/calendar?date=${pickupDay}&view=week`, { waitUntil: 'domcontentloaded' });
  const ev = page.getByTestId(`calendar-event-${target.dispatchNumber}`);
  if (!(await ev.getByTestId('dispatch-conflict-badge').isVisible({ timeout: 15000 }).catch(() => false))) fail('3', 'Calendar event badge missing');
  await ev.click();
  if (!(await page.getByText(/^Conflicts/).first().isVisible({ timeout: 8000 }).catch(() => false))) fail('3', 'Calendar workspace panel missing');

  // 4 Live validation
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const reassign = page.locator('button:visible').filter({ hasText: /reassign/i }).first();
  if (await reassign.isVisible({ timeout: 10000 }).catch(() => false)) {
    const auditBefore = (await apiGet(token, `/audit?entityId=${targetId}&limit=50`)).items?.filter((i: { action: string }) => i.action.includes('conflict')).length ?? 0;
    await reassign.click();
    const sel = page.locator('#reassign-sheet-driver').first();
    await expect(sel).toBeVisible();
    await expect.poll(async () => sel.locator('option').count()).toBeGreaterThan(1);
    let fired = false;
    page.on('request', (r) => { if (r.url().includes('/check-conflicts') && r.method() === 'POST') fired = true; });
    await sel.selectOption({ index: 1 });
    await page.waitForTimeout(600);
    if (!fired) fail('4', 'check-conflicts not fired');
    const auditAfter = (await apiGet(token, `/audit?entityId=${targetId}&limit=50`)).items?.filter((i: { action: string }) => i.action.includes('conflict')).length ?? 0;
    if (auditAfter > auditBefore) fail('4', 'Audit created during preview');
    await page.keyboard.press('Escape');
  } else fail('4', 'Reassign not visible');

  // 5 ignore + refresh
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const ign = page.getByRole('button', { name: /^Ignore$/ }).first();
  if (await ign.isVisible().catch(() => false)) {
    await ign.click();
    await page.waitForTimeout(1000);
    await page.reload();
    if (!(await page.getByText(/^History$/).isVisible({ timeout: 10000 }).catch(() => false))) fail('5', 'Ignore not persisted');
  }

  // 6 audit filter
  await page.goto(`${FRONTEND}/app/audit-logs`, { waitUntil: 'domcontentloaded' });
  const html = await page.getByTestId('audit-action-filter').innerHTML();
  for (const a of ['dispatch.conflict_detected','dispatch.conflict_ignored','dispatch.conflict_resolved','dispatch.conflict_rechecked']) {
    if (!html.includes(a)) fail('6', `${a} missing from filter`);
  }

  // 7 timeline
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (!(await page.locator('#timeline').getByText(/conflict/i).first().isVisible({ timeout: 10000 }).catch(() => false))) fail('7', 'Timeline conflict events missing');

  // 9 refresh
  await page.reload();
  if (!(await page.locator('aside').getByText(/^Conflicts/).isVisible({ timeout: 10000 }).catch(() => false))) fail('9', 'Panel missing after refresh');

  // 10 console
  for (const e of consoleErrors) {
    if (e.includes('cannot be a descendant of') || e.includes('validateDOMNesting')) fail('10', `Hydration: ${e.slice(0,100)}`);
    if (e.includes('duplicate key')) fail('10', `Duplicate key: ${e.slice(0,100)}`);
  }

  // 11 regression
  await page.goto(`${FRONTEND}/app/dispatches/board`, { waitUntil: 'domcontentloaded' });
  if (!(await page.locator('[data-testid^="dispatch-card-"]').first().isVisible({ timeout: 15000 }).catch(() => false))) fail('11', 'Board broken');
  await page.goto(`${FRONTEND}/app/dispatches/calendar`, { waitUntil: 'domcontentloaded' });
  if (!(await page.getByTestId('dispatch-calendar').isVisible({ timeout: 15000 }).catch(() => false))) fail('11', 'Calendar broken');

  console.log('BLOCKERS', blockers);
  expect(blockers).toEqual([]);
});

test('permissions QA', async ({ page }) => {
  test.setTimeout(300_000);
  const token = await login(page, 'admin@flowerp.test');
  const list = await apiGet(token, '/dispatches?limit=5');
  const did = list.items[0].id;
  const url = `${FRONTEND}/app/dispatches/${did}`;

  for (const [email, expectAccess, expectIgnore] of [
    ['dispatcher@flowerp.test', true, true],
    ['ops-manager@flowerp.test', true, true],
    ['accountant@flowerp.test', true, false],
    ['sales@flowerp.test', false, false],
    ['driver@flowerp.test', false, false],
  ] as const) {
    await new Promise((r) => setTimeout(r, 3000));
    await login(page, email);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const restricted = await page.getByText(/don't have access|You don't have access/i).isVisible().catch(() => false);
    if (expectAccess && restricted) fail('8', `${email} blocked incorrectly`);
    if (!expectAccess && !restricted) fail('8', `${email} should be blocked`);
    if (expectAccess && expectIgnore) {
      if (!(await page.getByRole('button', { name: /^Ignore$/ }).first().isVisible({ timeout: 8000 }).catch(() => false))) {
        // may have zero active conflicts — check Recheck at minimum
        if (!(await page.getByRole('button', { name: /recheck/i }).isVisible().catch(() => false))) fail('8', `${email} missing write controls`);
      }
    }
    if (expectAccess && !expectIgnore) {
      if (await page.getByRole('button', { name: /^Ignore$/ }).first().isVisible().catch(() => false)) fail('8', `${email} should be read-only`);
    }
  }
  console.log('PERM BLOCKERS', blockers);
  expect(blockers.filter((b) => b.area === '8')).toEqual([]);
});
