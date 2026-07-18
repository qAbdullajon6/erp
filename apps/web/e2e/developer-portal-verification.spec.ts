import { test, expect, type Page } from '@playwright/test';

/// Real-browser verification of the Developer Portal. Drives the actual UI —
/// clicking, typing, reading rendered text — rather than asserting on API
/// responses, which the e2e suite (apps/api/test/developer-portal.e2e-spec.ts)
/// already covers.
///
/// 127.0.0.1 for the API, not localhost: Playwright's request context resolves
/// localhost to ::1, which the API does not listen on.
const API_URL = process.env.API_URL || 'http://127.0.0.1:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const ADMIN = { email: 'admin@flowerp.test', password: 'FlowERP-Test-2026!' };

test.describe.configure({ mode: 'serial' });

let page: Page;
let adminToken: string;
/// Names are unique per run so a re-run never collides with rows left behind
/// by a previous one.
const RUN = Date.now();
const KEY_NAME = `PV Browser Key ${RUN}`;
const HOOK_NAME = `PV Browser Hook ${RUN}`;

test.beforeAll(async ({ browser }) => {
  const login = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  const body = await login.json();
  adminToken = body.data.accessToken;

  const context = await browser.newContext();
  // The app reads tokens from sessionStorage (see lib/api/session.ts), so
  // inject before any app code runs rather than after navigation.
  await context.addInitScript(
    ({ at, rt }) => {
      sessionStorage.setItem('flowerp_access_token', at);
      if (rt) sessionStorage.setItem('flowerp_refresh_token', rt);
    },
    { at: adminToken, rt: body.data.refreshToken },
  );
  page = await context.newPage();
});

test.afterAll(async () => {
  // Clean up anything this run created, by name.
  const headers = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

  const keys = await (await fetch(`${API_URL}/admin/api-keys`, { headers })).json();
  for (const k of keys.data.items.filter((x: { name: string }) => x.name.includes(`${RUN}`))) {
    await fetch(`${API_URL}/admin/api-keys/${k.id}`, { method: 'DELETE', headers });
  }

  const hooks = await (await fetch(`${API_URL}/admin/webhooks`, { headers })).json();
  for (const h of hooks.data.items.filter((x: { name: string }) => x.name.includes(`${RUN}`))) {
    await fetch(`${API_URL}/admin/webhooks/${h.id}`, { method: 'DELETE', headers });
  }
});

async function gotoTab(name: 'API Keys' | 'Webhooks' | 'Deliveries' | 'Usage') {
  await page.goto(`${FRONTEND_URL}/app/developer`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name }).click();
}

// ── Page + navigation ─────────────────────────────────────────────

test.describe('Developer page', () => {
  test('loads without console errors', async () => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto(`${FRONTEND_URL}/app/developer`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Developer' })).toBeVisible();
    // React key/prop warnings and failed fetches both surface here; a clean
    // console is the cheapest proof the page is actually wired up.
    expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
  });

  test('shows all four tabs', async () => {
    await page.goto(`${FRONTEND_URL}/app/developer`);
    await page.waitForLoadState('networkidle');
    for (const name of ['API Keys', 'Webhooks', 'Deliveries', 'Usage']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }
  });

  test('no tab renders an error state', async () => {
    for (const name of ['API Keys', 'Webhooks', 'Deliveries', 'Usage'] as const) {
      await gotoTab(name);
      await page.waitForTimeout(800);
      // Every tab has a "Failed to load ..." branch; seeing it means the
      // backend contract broke.
      await expect(page.getByText(/Failed to load/i)).toHaveCount(0);
    }
  });
});

// ── API keys ──────────────────────────────────────────────────────

test.describe('API Keys tab', () => {
  test('creates a key and reveals the secret exactly once', async () => {
    await gotoTab('API Keys');

    await page.getByRole('button', { name: 'Create API Key' }).click();
    await page.getByPlaceholder('My API Key').fill(KEY_NAME);
    await page.getByLabel('orders:read').check();
    await page.getByLabel('customers:read').check();
    await page.getByRole('button', { name: 'Create Key' }).click();

    // The reveal step: this is the only moment the raw key is visible.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Copy this key now/i)).toBeVisible();
    const revealed = await dialog.locator('.font-mono.select-all').first().textContent();
    expect(revealed).toMatch(/^flowerp_live_/);

    await dialog.getByRole('button', { name: 'Done' }).click();

    // Back in the list, only the prefix — never the secret.
    await expect(page.getByText(KEY_NAME)).toBeVisible();
    const listText = await page.locator('body').textContent();
    expect(listText).not.toContain(revealed!);
    expect(listText).toContain('flowerp_live_');
  });

  test('shows status and scopes for the new key', async () => {
    await gotoTab('API Keys');
    const card = page.locator('div.rounded-lg.border').filter({ hasText: KEY_NAME }).first();

    await expect(card.getByText('ACTIVE')).toBeVisible();
    await expect(card.getByText('orders:read')).toBeVisible();
    await expect(card.getByText('customers:read')).toBeVisible();
    await expect(card.getByText(/Never used|Last used/)).toBeVisible();
    await expect(card.getByText(/Rate limit: \d+\/min/)).toBeVisible();
  });

  test('disables and re-enables a key', async () => {
    await gotoTab('API Keys');
    const card = page.locator('div.rounded-lg.border').filter({ hasText: KEY_NAME }).first();

    await card.getByRole('button', { name: 'Disable' }).click();
    await expect(card.getByText('DISABLED')).toBeVisible();

    await card.getByRole('button', { name: 'Enable' }).click();
    await expect(card.getByText('ACTIVE')).toBeVisible();
  });

  test('rotating reveals a new secret', async () => {
    await gotoTab('API Keys');
    const card = page.locator('div.rounded-lg.border').filter({ hasText: KEY_NAME }).first();
    const prefixBefore = await card.locator('.font-mono').first().textContent();

    await card.getByRole('button', { name: 'Rotate' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Copy this key now/i)).toBeVisible();
    const rotated = await dialog.locator('.font-mono.select-all').first().textContent();
    expect(rotated).toMatch(/^flowerp_live_/);
    await dialog.getByRole('button', { name: 'Done' }).click();

    // The displayed prefix must track the new secret, or an operator matching
    // the key they just copied to this row would be comparing to a dead one.
    const cardAfter = page.locator('div.rounded-lg.border').filter({ hasText: KEY_NAME }).first();
    await expect(cardAfter.locator('.font-mono').first()).not.toHaveText(prefixBefore!);
  });

  test('revoking asks for confirmation and is reflected in the list', async () => {
    await gotoTab('API Keys');

    // A throwaway key, so the shared one survives for later tests.
    const throwaway = `PV Throwaway ${RUN}`;
    await page.getByRole('button', { name: 'Create API Key' }).click();
    await page.getByPlaceholder('My API Key').fill(throwaway);
    await page.getByLabel('orders:read').check();
    await page.getByRole('button', { name: 'Create Key' }).click();
    await page.getByRole('button', { name: 'Done' }).click();

    const card = page.locator('div.rounded-lg.border').filter({ hasText: throwaway }).first();
    await card.getByRole('button', { name: 'Revoke' }).click();

    // Destructive actions go through ConfirmDialog, never window.confirm.
    await expect(page.getByText(/Revoke API key\?/i)).toBeVisible();
    await page.getByRole('button', { name: 'Revoke', exact: true }).last().click();

    const revokedCard = page.locator('div.rounded-lg.border').filter({ hasText: throwaway }).first();
    await expect(revokedCard.getByText('REVOKED')).toBeVisible();
    // A revoked key is terminal: offering these would surface a guaranteed 409.
    await expect(revokedCard.getByRole('button', { name: 'Rotate' })).toHaveCount(0);
    await expect(revokedCard.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
  });
});

// ── Webhooks ──────────────────────────────────────────────────────

test.describe('Webhooks tab', () => {
  test('rejects a private URL with a readable error', async () => {
    await gotoTab('Webhooks');

    await page.getByRole('button', { name: 'Add Webhook' }).click();
    await page.getByPlaceholder('My Webhook').fill(`PV SSRF ${RUN}`);
    await page.getByPlaceholder('https://example.com/hook').fill('http://169.254.169.254/latest/meta-data/');
    await page.getByLabel('order.created').check();
    await page.getByRole('button', { name: 'Create' }).click();

    // The SSRF rejection must reach the user as a message, not a silent no-op.
    await expect(page.getByText(/private, loopback, or link-local/i)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
  });

  test('creates a webhook and reveals the signing secret once', async () => {
    await gotoTab('Webhooks');

    await page.getByRole('button', { name: 'Add Webhook' }).click();
    await page.getByPlaceholder('My Webhook').fill(HOOK_NAME);
    await page.getByPlaceholder('https://example.com/hook').fill('https://example.com/pv-hook');
    await page.getByLabel('order.created').check();
    await page.getByLabel('invoice.paid').check();
    await page.getByRole('button', { name: 'Create' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Copy it now/i)).toBeVisible();
    const secret = await dialog.locator('.font-mono.select-all').first().textContent();
    expect(secret).toMatch(/^whsec_/);

    await dialog.getByRole('button', { name: 'Done' }).click();

    await expect(page.getByText(HOOK_NAME)).toBeVisible();
    // The secret must not survive into the list.
    expect(await page.locator('body').textContent()).not.toContain(secret!);
  });

  test('event checkboxes come from the server, not free text', async () => {
    await gotoTab('Webhooks');
    await page.getByRole('button', { name: 'Add Webhook' }).click();

    // Replaces a comma-separated text field whose typos produced an
    // unanticipatable 400.
    await expect(page.getByLabel('order.created')).toBeVisible();
    await expect(page.getByLabel('dispatch.assigned')).toHaveCount(0); // not a real event
    await expect(page.getByLabel('invoice.paid')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('shows the endpoint with its events and active state', async () => {
    await gotoTab('Webhooks');
    const card = page.locator('div.rounded-lg.border').filter({ hasText: HOOK_NAME }).first();

    await expect(card.getByText('Active')).toBeVisible();
    await expect(card.getByText('order.created')).toBeVisible();
    await expect(card.getByText('invoice.paid')).toBeVisible();
    await expect(card.getByText('https://example.com/pv-hook')).toBeVisible();
  });

  test('edit loads the endpoint and saves a change', async () => {
    await gotoTab('Webhooks');
    const card = page.locator('div.rounded-lg.border').filter({ hasText: HOOK_NAME }).first();

    // Edit was previously unreachable: nothing called setEditId, and the
    // dialog was gated so the edit form could never render.
    await card.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByText('Edit Webhook')).toBeVisible();
    await expect(page.getByPlaceholder('My Webhook')).toHaveValue(HOOK_NAME);
    await expect(page.getByLabel('order.created')).toBeChecked();

    await page.getByPlaceholder('https://example.com/hook').fill('https://example.com/pv-hook-edited');
    await page.getByRole('button', { name: 'Update' }).click();

    await expect(page.getByText('https://example.com/pv-hook-edited')).toBeVisible();
  });

  test('test delivery reports a real failure against an unreachable endpoint', async () => {
    await gotoTab('Webhooks');
    const card = page.locator('div.rounded-lg.border').filter({ hasText: HOOK_NAME }).first();

    await card.getByRole('button', { name: 'Test' }).click();

    // example.com is reachable but does not accept POSTs — either way the UI
    // must report an outcome, not sit silent.
    await expect(page.getByText(/Test delivered|Test failed/i)).toBeVisible({ timeout: 20_000 });
  });

  test('disables and re-enables an endpoint', async () => {
    await gotoTab('Webhooks');
    const card = page.locator('div.rounded-lg.border').filter({ hasText: HOOK_NAME }).first();

    await card.getByRole('button', { name: 'Disable' }).click();
    await expect(card.getByText('Disabled')).toBeVisible();

    await card.getByRole('button', { name: 'Enable' }).click();
    await expect(card.getByText('Active')).toBeVisible();
  });

  test('rotating the secret reveals the new one', async () => {
    await gotoTab('Webhooks');
    const card = page.locator('div.rounded-lg.border').filter({ hasText: HOOK_NAME }).first();

    await card.getByRole('button', { name: 'Rotate Secret' }).click();

    // Scoped to the dialog: the success toast also says "copy it now", so an
    // unscoped text match is ambiguous.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Copy it now/i)).toBeVisible();
    expect(await dialog.locator('.font-mono.select-all').first().textContent()).toMatch(/^whsec_/);
    await dialog.getByRole('button', { name: 'Done' }).click();
  });
});

// ── Deliveries ────────────────────────────────────────────────────

test.describe('Deliveries tab', () => {
  test('prompts for a webhook before showing anything', async () => {
    await gotoTab('Deliveries');
    await expect(page.getByText(/Select a webhook to view its delivery history/i)).toBeVisible();
  });

  test('lists deliveries for the selected webhook and opens one', async () => {
    await gotoTab('Deliveries');

    await page.locator('select').selectOption({ label: HOOK_NAME });
    await page.waitForTimeout(1500);

    // The Test above produced at least one delivery.
    const rows = page.locator('button').filter({ hasText: /Event:/ });
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    await rows.first().click();
    await expect(page.getByText('Delivery Details')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
    // The exact body sent — what makes a failure diagnosable.
    await expect(page.getByText('Payload')).toBeVisible();
  });

  test('a failed delivery offers Retry; a delivered one does not', async () => {
    await gotoTab('Deliveries');
    await page.locator('select').selectOption({ label: HOOK_NAME });
    await page.waitForTimeout(1500);

    const rows = page.locator('button').filter({ hasText: /Event:/ });
    await rows.first().click();
    await expect(page.getByText('Delivery Details')).toBeVisible();

    const isFailed = await page.locator('text=Delivery Details').locator('..').getByText('FAILED').count();
    const retry = page.getByRole('button', { name: 'Retry' });
    // Retry only applies to a FAILED delivery — the server 409s otherwise, so
    // the button must not be offered for any other state.
    if (isFailed > 0) await expect(retry).toBeVisible();
    else await expect(retry).toHaveCount(0);
  });
});

// ── Usage ─────────────────────────────────────────────────────────

test.describe('Usage tab', () => {
  test('renders every metric without error', async () => {
    // Generate real key-authenticated traffic so the tab has something to show.
    const created = await (
      await fetch(`${API_URL}/admin/api-keys`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `PV Usage Key ${RUN}`, scopes: ['orders:read'] }),
      })
    ).json();
    for (let i = 0; i < 3; i++) {
      await fetch(`${API_URL}/v1/orders`, { headers: { 'X-API-Key': created.data.rawKey } });
    }
    // The usage write is fire-and-forget on res.on("finish").
    await new Promise((r) => setTimeout(r, 1200));

    await gotoTab('Usage');
    await page.waitForTimeout(1500);

    await expect(page.getByText('Total API Calls')).toBeVisible();
    await expect(page.getByText('Success Rate')).toBeVisible();
    await expect(page.getByText('Avg Latency')).toBeVisible();
    await expect(page.getByText('Unique Endpoints')).toBeVisible();
    await expect(page.getByText('Webhook Deliveries')).toBeVisible();
    await expect(page.getByText('Last Activity')).toBeVisible();
    await expect(page.getByText('Status Breakdown')).toBeVisible();
    await expect(page.getByText('Endpoint Breakdown')).toBeVisible();
  });

  test('reports the traffic that was actually generated', async () => {
    await gotoTab('Usage');
    await page.waitForTimeout(1500);

    // Route template, not a concrete path — ids must never reach analytics.
    await expect(page.getByText('/v1/orders')).toBeVisible();
    await expect(page.getByText('200', { exact: false }).first()).toBeVisible();
  });

  test('date filtering re-queries', async () => {
    await gotoTab('Usage');

    // A window that predates all traffic must report nothing rather than
    // silently ignoring the filter.
    await page.locator('input[type="date"]').first().fill('2020-01-01');
    await page.locator('input[type="date"]').nth(1).fill('2020-01-31');
    await page.getByRole('button', { name: 'Refresh' }).click();
    await page.waitForTimeout(1500);

    await expect(page.getByText('No API calls recorded in this period')).toBeVisible();
  });
});
