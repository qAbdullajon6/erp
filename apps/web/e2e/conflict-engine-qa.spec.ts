import { expect, test, type Page } from '@playwright/test';

const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
const API = process.env.API_URL || 'http://127.0.0.1:4000';
const ADMIN_EMAIL = 'admin@flowerp.test';
const ADMIN_PASSWORD = 'FlowERP-Test-2026!';

async function apiLogin() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`API login failed: ${res.status}`);
  const body = await res.json();
  const data = body.data ?? body;
  return data.accessToken as string;
}

async function apiGet(token: string, path: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  const body = await res.json();
  return body.data ?? body;
}

async function apiPost(token: string, path: string, payload?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  const body = await res.json();
  return body.data ?? body;
}

async function login(page: Page) {
  const token = await apiLogin();
  await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((access) => {
    sessionStorage.setItem('flowerp_access_token', access);
  }, token);
  await page.goto(`${FRONTEND}/app`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
  return token;
}

async function findDispatchWithConflicts(token: string) {
  const list = await apiGet(token, '/dispatches?limit=50');
  const ids = (list.items ?? []).map((d: { id: string }) => d.id);
  if (ids.length === 0) throw new Error('No dispatches in test org');
  const batch = await apiPost(token, '/dispatches/conflicts/batch', { ids });
  for (const id of ids) {
    const entry = batch[id];
    if (entry?.summary?.unresolved > 0) {
      const dispatch = list.items.find((d: { id: string }) => d.id === id);
      return { id, dispatchNumber: dispatch?.dispatchNumber as string | undefined };
    }
  }
  return { id: ids[0] as string, dispatchNumber: list.items[0]?.dispatchNumber as string | undefined };
}

test.describe.configure({ mode: 'serial' });

test.describe('P3.3.2E Conflict Engine UI QA', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'authenticated', 'Run under --project=unauthenticated');
  });

  test('full conflict engine browser QA', async ({ page }) => {
    test.setTimeout(180_000);
    const results: Record<string, 'pass' | 'fail' | 'skip'> = {};
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const token = await login(page);
    const target = await findDispatchWithConflicts(token);
    const dispatchUrl = `${FRONTEND}/app/dispatches/${target.id}`;

    // 2. Planning Board badges (before mutating conflicts)
    await page.goto(`${FRONTEND}/app/dispatches/board`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    if (target.dispatchNumber) {
      const card = page.getByTestId(`dispatch-card-${target.dispatchNumber}`);
      await expect(card).toBeVisible({ timeout: 20_000 });
      const badge = card.getByTestId('dispatch-conflict-badge');
      results['2. Planning Board badges'] = (await badge.isVisible().catch(() => false)) ? 'pass' : 'fail';
    } else {
      results['2. Planning Board badges'] = 'fail';
    }

    // 3. Calendar badges (before mutating conflicts)
    const dispatchDetail = await apiGet(token, `/dispatches/${target.id}`);
    const pickupDay = (dispatchDetail.pickupDateScheduled as string).slice(0, 10);
    await page.goto(`${FRONTEND}/app/dispatches/calendar?date=${pickupDay}&view=week`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    const calEvent = target.dispatchNumber
      ? page.getByTestId(`calendar-event-${target.dispatchNumber}`)
      : page.locator('[data-testid^="calendar-event-"]').first();
    if (await calEvent.isVisible({ timeout: 15_000 }).catch(() => false)) {
      results['3. Calendar badges'] = (await calEvent
        .getByTestId('dispatch-conflict-badge')
        .isVisible()
        .catch(() => false))
        ? 'pass'
        : 'fail';
    } else {
      results['3. Calendar badges'] = 'fail';
    }

    // 1. Dispatch Detail Conflict Panel
    await page.goto(dispatchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    const panelHeading = page.locator('aside').getByText(/^Conflicts/);
    await expect(panelHeading).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Failed to load conflicts')).not.toBeVisible({ timeout: 5_000 });
    results['1. Dispatch Detail Conflict Panel'] = 'pass';

    // 7. Recommendations
    const hasRecButton = await page
      .getByRole('button', { name: /swap|reschedule|larger|contact|renew|assign/i })
      .first()
      .isVisible()
      .catch(() => false);
    const hasRecText = await page
      .locator('aside')
      .getByText(/recommend|assign|reschedule|vehicle|driver|inspection/i)
      .first()
      .isVisible()
      .catch(() => false);
    results['7. Recommendations'] = hasRecButton || hasRecText ? 'pass' : 'fail';

    // 4. Live validation — before mutating conflicts
    const reassignBtn = page.locator('button:visible').filter({ hasText: /reassign/i }).first();
    if (await reassignBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await reassignBtn.click();
      const driverSelect = page.locator('#reassign-sheet-driver, #reassign-driver').first();
      await expect(driverSelect).toBeVisible({ timeout: 10_000 });
      await expect
        .poll(async () => driverSelect.locator('option').count(), { timeout: 15_000 })
        .toBeGreaterThan(1);
      const options = await driverSelect.locator('option').count();
      if (options > 1) {
        const [response] = await Promise.all([
          page.waitForResponse(
            (r) => r.url().includes('/check-conflicts') && r.request().method() === 'POST',
            { timeout: 25_000 },
          ),
          driverSelect.selectOption({ index: 1 }),
        ]);
        results['4. Live validation'] = response.ok() ? 'pass' : 'fail';
      } else {
        results['4. Live validation'] = 'skip';
      }
      await page.keyboard.press('Escape');
    } else {
      results['4. Live validation'] = 'skip';
    }

    // 5. Ignore
    const ignoreBtn = page.getByRole('button', { name: /^Ignore$/ }).first();
    if (await ignoreBtn.isVisible().catch(() => false)) {
      await ignoreBtn.click();
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: /ignored/i })).toBeVisible({
        timeout: 15_000,
      });
      results['5. Ignore'] = 'pass';
    } else {
      results['5. Ignore'] = 'skip';
    }

    // 6. Resolve
    const resolveBtn = page.getByRole('button', { name: /mark resolved/i }).first();
    if (await resolveBtn.isVisible().catch(() => false)) {
      await resolveBtn.click();
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: /resolved/i })).toBeVisible({
        timeout: 15_000,
      });
      results['6. Resolve'] = 'pass';
    } else {
      results['6. Resolve'] = 'skip';
    }

    // 8. Refresh persistence
    const recheckBtn = page.getByRole('button', { name: /recheck/i });
    await expect(recheckBtn).toBeVisible();
    await recheckBtn.click();
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(panelHeading).toBeVisible({ timeout: 20_000 });
    results['8. Refresh persistence'] = (await page.getByText(/^History$/).isVisible().catch(() => false))
      ? 'pass'
      : 'fail';

    // 9. Audit
    await expect(page.locator('#timeline')).toBeVisible();
    results['9. Audit'] = (await page
      .locator('#timeline')
      .getByText(/conflict/i)
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false))
      ? 'pass'
      : 'fail';

    // 10. Regression
    await page.goto(`${FRONTEND}/app/dispatches/board`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/failed to load conflicts/i)).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator('body')).not.toContainText('Failed to load conflicts');
    results['10. Regression'] = 'pass';

    console.log('\n=== P3.3.2E QA RESULTS ===');
    for (const [k, v] of Object.entries(results)) {
      console.log(`${v === 'pass' ? '✅' : v === 'skip' ? '⏭️' : '❌'} ${k}: ${v.toUpperCase()}`);
    }

    const blockers = Object.entries(results).filter(([, v]) => v === 'fail');
    const hydrationErrors = consoleErrors.filter(
      (e) => e.includes('cannot be a descendant of') || e.includes('validateDOMNesting'),
    );
    if (hydrationErrors.length > 0) {
      throw new Error(`Console hydration errors: ${hydrationErrors.join('; ')}`);
    }
    if (blockers.length > 0) {
      throw new Error(`Blockers: ${blockers.map(([k]) => k).join(', ')}`);
    }
  });
});
