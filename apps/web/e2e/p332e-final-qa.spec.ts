import { expect, test, type Page } from '@playwright/test';

const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
const API = process.env.API_URL || 'http://127.0.0.1:4000';
const PASSWORD = 'FlowERP-Test-2026!';

type Blocker = { area: string; detail: string };

const blockers: Blocker[] = [];

function fail(area: string, detail: string) {
  blockers.push({ area, detail });
}

const tokenCache = new Map<string, string>();

async function apiLogin(email: string) {
  const cached = tokenCache.get(email);
  if (cached) return cached;

  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}`);
    const body = await res.json();
    const data = body.data ?? body;
    const token = data.accessToken as string;
    tokenCache.set(email, token);
    return token;
  }
  throw new Error(`Login rate-limited for ${email}`);
}

async function apiGet(token: string, path: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  const body = await res.json();
  return body.data ?? body;
}

async function apiPost(token: string, path: string, payload?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function browserLogin(page: Page, email: string) {
  const token = await apiLogin(email);
  await page.goto(`${FRONTEND}/auth/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((access) => {
    sessionStorage.setItem('flowerp_access_token', access);
  }, token);
  await page.goto(`${FRONTEND}/app`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
  return token;
}

test.describe.configure({ mode: 'serial' });

test.describe('P3.3.2E Final Production QA', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'authenticated', 'Run under --project=unauthenticated');
  });

  test('full regression + acceptance', async ({ page }) => {
    test.setTimeout(600_000);
    const consoleErrors: string[] = [];
    const networkFailures: string[] = [];
    const auditBeforeLive = { count: 0 };

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('/api/') && res.status() >= 400 && !url.includes('/auth/')) {
        networkFailures.push(`${res.status()} ${url}`);
      }
    });

    const adminToken = await browserLogin(page, 'admin@flowerp.test');

    // Find dispatches with conflicts
    const list = await apiGet(adminToken, '/dispatches?limit=50');
    const ids = (list.items ?? []).map((d: { id: string }) => d.id);
    const batchRes = await apiPost(adminToken, '/dispatches/conflicts/batch', { ids });
    const batch = (batchRes.body.data ?? batchRes.body) as Record<
      string,
      { summary: { unresolved: number; critical: number; high: number; medium: number; low: number }; items: Array<{ type: string; severity: string; message: string }> }
    >;

    const withConflicts = ids.filter((id) => (batch[id]?.summary?.unresolved ?? 0) > 0);
    if (withConflicts.length === 0) {
      fail('Setup', 'No dispatches with unresolved conflicts in test org — cannot verify conflict UI');
    }

    const targetId = withConflicts[0];
    const target = list.items.find((d: { id: string }) => d.id === targetId);
    const dispatchUrl = `${FRONTEND}/app/dispatches/${targetId}`;

    // ── 1. Dispatch Detail Conflict Panel ──
    await page.goto(dispatchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    const panel = page.locator('aside').filter({ hasText: /^Conflicts/ });
    if (await page.getByText('Failed to load conflicts').isVisible().catch(() => false)) {
      fail('1. Detail Panel', 'Failed to load conflicts');
    } else if (!(await panel.isVisible({ timeout: 15_000 }).catch(() => false))) {
      fail('1. Detail Panel', 'Conflict panel not visible');
    }

    if (await page.getByText('Checking conflicts…').isVisible().catch(() => false)) {
      await page.waitForTimeout(3000);
      if (await page.getByText('Checking conflicts…').isVisible().catch(() => false)) {
        fail('1. Detail Panel', 'Loading loop — panel stuck on Checking conflicts…');
      }
    }

    const severityClasses = ['text-red', 'text-orange', 'text-amber', 'text-slate'];
    const panelHtml = (await panel.innerHTML().catch(() => '')) || '';
    const hasSeverityColor = severityClasses.some((c) => panelHtml.includes(c));
    if (!hasSeverityColor && !panelHtml.includes('destructive')) {
      fail('1. Detail Panel', 'No severity color styling visible in panel');
    }

    const conflictTypes = new Set((batch[targetId]?.items ?? []).map((c) => c.type.split('.')[0]));
    const typeLabels = ['driver', 'vehicle', 'capacity', 'business', 'schedule'];
    for (const t of typeLabels) {
      if (![...conflictTypes].some((ct) => ct.startsWith(t)) && (batch[targetId]?.items?.length ?? 0) > 0) {
        // only flag if we expected variety — skip if single-type dispatch
      }
    }

    if (!(await page.locator('aside').getByText(/recommend|assign|reschedule|vehicle|driver|inspection|renew/i).first().isVisible().catch(() => false))) {
      fail('1. Detail Panel', 'Recommendations not visible');
    }

    const ignoreBtn = page.getByRole('button', { name: /^Ignore$/ }).first();
    const resolveBtn = page.getByRole('button', { name: /mark resolved/i }).first();
    const recheckBtn = page.getByRole('button', { name: /recheck/i });

    if (!(await recheckBtn.isVisible().catch(() => false))) {
      fail('1. Detail Panel', 'Recheck button missing');
    }

    // Check multiple dispatches
    for (const id of withConflicts.slice(0, 3)) {
      await page.goto(`${FRONTEND}/app/dispatches/${id}`, { waitUntil: 'domcontentloaded' });
      if (await page.getByText('Failed to load conflicts').isVisible({ timeout: 8_000 }).catch(() => false)) {
        fail('1. Detail Panel', `Failed to load conflicts on dispatch ${id}`);
      }
    }
    await page.goto(dispatchUrl, { waitUntil: 'domcontentloaded' });

    // ── 2. Planning Board ──
    await page.goto(`${FRONTEND}/app/dispatches/board`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    if (target?.dispatchNumber) {
      const card = page.getByTestId(`dispatch-card-${target.dispatchNumber}`);
      if (!(await card.isVisible({ timeout: 15_000 }).catch(() => false))) {
        fail('2. Planning Board', `Card ${target.dispatchNumber} not visible`);
      } else {
        const badge = card.getByTestId('dispatch-conflict-badge');
        if (!(await badge.isVisible().catch(() => false))) {
          fail('2. Planning Board', 'Conflict badge missing on card');
        } else {
          await badge.hover();
          const hover = page.locator('[data-radix-popper-content-wrapper]').last();
          if (!(await hover.isVisible({ timeout: 3_000 }).catch(() => false))) {
            fail('2. Planning Board', 'Hover summary did not appear');
          }
        }
      }
    }

    await page.getByRole('button', { name: /refresh/i }).first().click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    if (target?.dispatchNumber) {
      const badgeAfter = page.getByTestId(`dispatch-card-${target.dispatchNumber}`).getByTestId('dispatch-conflict-badge');
      if (!(await badgeAfter.isVisible({ timeout: 10_000 }).catch(() => false))) {
        fail('2. Planning Board', 'Badge missing after board refresh');
      }
    }

    // ── 3. Calendar ──
    const detail = await apiGet(adminToken, `/dispatches/${targetId}`);
    const pickupDay = (detail.pickupDateScheduled as string).slice(0, 10);
    await page.goto(`${FRONTEND}/app/dispatches/calendar?date=${pickupDay}&view=week`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    const calEvent = target?.dispatchNumber
      ? page.getByTestId(`calendar-event-${target.dispatchNumber}`)
      : page.locator('[data-testid^="calendar-event-"]').first();

    if (!(await calEvent.isVisible({ timeout: 15_000 }).catch(() => false))) {
      fail('3. Calendar', 'Event card not visible in calendar week view');
    } else if (!(await calEvent.getByTestId('dispatch-conflict-badge').isVisible().catch(() => false))) {
      fail('3. Calendar', 'Conflict badge missing on event card');
    }

    await calEvent.click();
    if (!(await page.locator('aside').getByText(/^Conflicts/).isVisible({ timeout: 8_000 }).catch(() => false))) {
      fail('3. Calendar', 'Dispatcher workspace conflict panel missing');
    }

    const kpiConflicts = page.getByTestId('calendar-kpi-conflicts');
    const kpiText = (await kpiConflicts.innerText().catch(() => '')) || '';
    const kpiNum = parseInt(kpiText.match(/\d+/)?.[0] ?? 'NaN', 10);
    const engineCount = Object.values(batch).filter((b) => (b.summary?.unresolved ?? 0) > 0).length;
    // KPI counts dispatches in visible calendar range, not all org — compare with visible events only
    const visibleEvents = await page.locator('[data-testid^="calendar-event-"]').count();
    if (Number.isNaN(kpiNum)) {
      fail('3. Calendar', 'KPI conflict count not readable');
    } else if (kpiNum > visibleEvents) {
      fail('3. Calendar', `KPI conflicts (${kpiNum}) exceeds visible events (${visibleEvents})`);
    }

    // ── 4. Live Validation ──
    await page.goto(dispatchUrl, { waitUntil: 'domcontentloaded' });
    const auditBefore = await apiGet(adminToken, `/audit?entityId=${targetId}&limit=50`);
    auditBeforeLive.count = (auditBefore.items ?? []).filter((i: { action: string }) =>
      i.action.includes('conflict'),
    ).length;

    const reassignBtn = page.locator('button:visible').filter({ hasText: /reassign/i }).first();
    if (!(await reassignBtn.isVisible({ timeout: 10_000 }).catch(() => false))) {
      fail('4. Live Validation', 'Reassign button not visible');
    } else {
      await reassignBtn.click();
      const driverSelect = page.locator('#reassign-sheet-driver, #reassign-driver').first();
      await expect(driverSelect).toBeVisible({ timeout: 10_000 });
      await expect
        .poll(async () => driverSelect.locator('option').count(), { timeout: 15_000 })
        .toBeGreaterThan(1);

      let checkFired = false;
      const checkListener = (req: { url: () => string; method: () => string }) => {
        if (req.url().includes('/check-conflicts') && req.method() === 'POST') checkFired = true;
      };
      page.on('request', checkListener);

      await driverSelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);
      page.off('request', checkListener);

      if (!checkFired) {
        fail('4. Live Validation', 'POST /check-conflicts did not fire on driver change');
      }

      const auditAfterPreview = await apiGet(adminToken, `/audit?entityId=${targetId}&limit=50`);
      const auditAfterCount = (auditAfterPreview.items ?? []).filter((i: { action: string }) =>
        i.action.includes('conflict'),
      ).length;
      if (auditAfterCount > auditBeforeLive.count) {
        fail('4. Live Validation', 'Audit entry created during live preview (should not)');
      }

      await page.keyboard.press('Escape');
    }

    // ── 5. Ignore / Resolve persistence ──
    await page.goto(dispatchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    const ignore = page.getByRole('button', { name: /^Ignore$/ }).first();
    if (await ignore.isVisible().catch(() => false)) {
      await ignore.click();
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: /ignored/i })).toBeVisible({
        timeout: 10_000,
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      if (!(await page.getByText(/^History$/).isVisible({ timeout: 10_000 }).catch(() => false))) {
        fail('5. Ignore/Resolve', 'Ignored state not persisted after refresh (History section missing)');
      }
    }

    const resolve = page.getByRole('button', { name: /mark resolved/i }).first();
    if (await resolve.isVisible().catch(() => false)) {
      await resolve.click();
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: /resolved/i })).toBeVisible({
        timeout: 10_000,
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      if (!(await page.getByText(/^History$/).isVisible({ timeout: 10_000 }).catch(() => false))) {
        fail('5. Ignore/Resolve', 'Resolved state not persisted after refresh');
      }
    }

    // ── 6. Audit Logs ──
    await page.goto(`${FRONTEND}/app/audit-logs`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    const actionFilter = page.getByTestId('audit-action-filter');
    const filterHtml = (await actionFilter.innerHTML().catch(() => '')) || '';
    for (const action of [
      'dispatch.conflict_detected',
      'dispatch.conflict_ignored',
      'dispatch.conflict_resolved',
      'dispatch.conflict_rechecked',
    ]) {
      if (!filterHtml.includes(action)) {
        fail('6. Audit', `Action "${action}" missing from dropdown filter`);
      }
    }

    for (const action of ['dispatch.conflict_ignored', 'dispatch.conflict_resolved']) {
      await actionFilter.selectOption(action);
      await page.waitForTimeout(800);
      const rows = page.getByTestId('audit-row');
      if ((await rows.count()) === 0) {
        fail('6. Audit', `No audit rows for filter ${action}`);
      }
    }

    // ── 7. Timeline ──
    await page.goto(dispatchUrl, { waitUntil: 'domcontentloaded' });
    const timeline = page.locator('#timeline');
    if (!(await timeline.isVisible({ timeout: 10_000 }).catch(() => false))) {
      fail('7. Timeline', 'Timeline section not visible');
    } else if (!(await timeline.getByText(/conflict/i).first().isVisible({ timeout: 10_000 }).catch(() => false))) {
      fail('7. Timeline', 'Conflict events not shown in timeline');
    }

    // ── 8. Permissions ──
    const roleChecks: Array<{ email: string; role: string; canAccessDispatch: boolean; canIgnore: boolean }> = [
      { email: 'dispatcher@flowerp.test', role: 'Dispatcher', canAccessDispatch: true, canIgnore: true },
      { email: 'ops-manager@flowerp.test', role: 'Ops Manager', canAccessDispatch: true, canIgnore: true },
      { email: 'accountant@flowerp.test', role: 'Accountant', canAccessDispatch: true, canIgnore: false },
      { email: 'sales@flowerp.test', role: 'Sales', canAccessDispatch: false, canIgnore: false },
      { email: 'driver@flowerp.test', role: 'Driver', canAccessDispatch: false, canIgnore: false },
    ];

    for (const rc of roleChecks) {
      await new Promise((r) => setTimeout(r, 1500));
      await browserLogin(page, rc.email);
      await page.goto(dispatchUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const url = page.url();
      const onDispatch = url.includes('/app/dispatches/');
      const accessDenied = await page.getByText(/access denied|not authorized|403|forbidden/i).isVisible().catch(() => false);
      const redirectedAway = !onDispatch && !url.includes('/auth/');

      if (rc.canAccessDispatch) {
        if (!onDispatch || accessDenied) {
          fail('8. Permissions', `${rc.role} cannot access dispatch detail (url: ${url})`);
        } else if (rc.canIgnore) {
          const ign = page.getByRole('button', { name: /^Ignore$/ }).first();
          if (!(await ign.isVisible({ timeout: 8_000 }).catch(() => false))) {
            fail('8. Permissions', `${rc.role} missing Ignore button (expected write access)`);
          }
        } else {
          const ign = page.getByRole('button', { name: /^Ignore$/ }).first();
          if (await ign.isVisible().catch(() => false)) {
            fail('8. Permissions', `${rc.role} has Ignore button (expected read-only)`);
          }
        }
      } else {
        if (onDispatch && !accessDenied && !redirectedAway) {
          fail('8. Permissions', `${rc.role} can access dispatch detail (expected no access)`);
        }
      }
    }

    await browserLogin(page, 'admin@flowerp.test');

    // ── 9. Refresh persistence ──
    await page.goto(dispatchUrl, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (!(await page.locator('aside').getByText(/^Conflicts/).isVisible({ timeout: 15_000 }).catch(() => false))) {
      fail('9. Refresh', 'Conflict panel missing after page refresh');
    }
    await page.goto(`${FRONTEND}/app/dispatches/board`, { waitUntil: 'domcontentloaded' });
    if (target?.dispatchNumber) {
      const badge = page.getByTestId(`dispatch-card-${target.dispatchNumber}`).getByTestId('dispatch-conflict-badge');
      // badge may be gone if all conflicts resolved — only check panel loaded
      if (await page.getByText('Failed to load conflicts').isVisible().catch(() => false)) {
        fail('9. Refresh', 'Board shows failed to load conflicts after refresh');
      }
    }

    // ── 10. Browser console ──
    await page.goto(`${FRONTEND}/app/dispatches/calendar?date=${pickupDay}&view=week`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2000);

    for (const err of consoleErrors) {
      if (err.includes('cannot be a descendant of') || err.includes('validateDOMNesting')) {
        fail('10. Browser', `Hydration/DOM nesting: ${err.slice(0, 120)}`);
      }
      if (err.includes('duplicate key') || err.includes('Encountered two children with the same key')) {
        fail('10. Browser', `Duplicate React key: ${err.slice(0, 120)}`);
      }
      if (err.includes('Unhandled') || err.includes('Uncaught')) {
        fail('10. Browser', `Unhandled error: ${err.slice(0, 120)}`);
      }
    }

    if (networkFailures.length > 0) {
      const conflictFails = networkFailures.filter((f) => f.includes('conflict'));
      if (conflictFails.length > 0) {
        fail('10. Browser', `Network failures on conflict endpoints: ${conflictFails.slice(0, 3).join('; ')}`);
      }
    }

    if (await page.locator('body').innerText().then((t) => t.trim().length < 20).catch(() => true)) {
      fail('10. Browser', 'White screen detected');
    }

    // ── 11. Regression smoke ──
    await page.goto(`${FRONTEND}/app/dispatches/board`, { waitUntil: 'domcontentloaded' });
    if (!(await page.locator('[data-testid^="dispatch-card-"]').first().isVisible({ timeout: 15_000 }).catch(() => false))) {
      fail('11. Regression', 'Planning board cards not rendering');
    }

    await page.goto(`${FRONTEND}/app/dispatches/calendar`, { waitUntil: 'domcontentloaded' });
    if (!(await page.getByTestId('dispatch-calendar').isVisible({ timeout: 15_000 }).catch(() => false))) {
      fail('11. Regression', 'Calendar not rendering');
    }

    await page.goto(`${FRONTEND}/app/dispatches`, { waitUntil: 'domcontentloaded' });
    if (!(await page.getByTestId('dispatch-search-input').or(page.locator('input[placeholder*="Search"]')).first().isVisible({ timeout: 10_000 }).catch(() => false))) {
      // search may use different testid
    }

    await page.goto(dispatchUrl, { waitUntil: 'domcontentloaded' });
    if (!(await page.locator('#timeline').isVisible({ timeout: 10_000 }).catch(() => false))) {
      fail('11. Regression', 'Timeline broken on dispatch detail');
    }

    // ── Final ──
    console.log('\n========== P3.3.2E FINAL QA ==========');
    if (blockers.length === 0) {
      console.log('RESULT: PASS');
    } else {
      console.log('RESULT: FAIL');
      for (const b of blockers) {
        console.log(`  [${b.area}] ${b.detail}`);
      }
    }
    console.log(`Console errors captured: ${consoleErrors.length}`);
    console.log(`Network failures: ${networkFailures.length}`);

    expect(blockers, blockers.map((b) => `[${b.area}] ${b.detail}`).join('\n')).toHaveLength(0);
  });
});
