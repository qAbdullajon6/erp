import { test, expect, type Page } from '@playwright/test';

/// Real-browser verification of the Import Wizard. Drives the actual UI —
/// picking files, choosing mappings, clicking through the steps — rather than
/// asserting on API responses, which apps/api/test/import.e2e-spec.ts covers.
///
/// 127.0.0.1 for the API, not localhost: Playwright's request context resolves
/// localhost to ::1, which the API does not listen on.
const API_URL = process.env.API_URL || 'http://127.0.0.1:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const ADMIN = { email: 'admin@flowerp.test', password: 'FlowERP-Test-2026!' };

test.describe.configure({ mode: 'serial' });

let page: Page;
let adminToken: string;
const RUN = Date.now();

test.beforeAll(async ({ browser }) => {
  const login = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  const body = await login.json();
  adminToken = body.data.accessToken;

  const context = await browser.newContext();
  // The app reads tokens from sessionStorage (lib/api/session.ts), so inject
  // before any app code runs rather than after navigation.
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
  // Remove what this run created, so a re-run starts clean.
  const headers = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
  const list = await (await fetch(`${API_URL}/customers?search=BW-${RUN}&limit=100`, { headers })).json();
  for (const c of list.data?.items ?? []) {
    await fetch(`${API_URL}/customers/${c.id}`, { method: 'DELETE', headers });
  }
});

/// Attaches an in-memory CSV, so the spec carries no fixture files.
async function attachCsv(name: string, content: string) {
  await page.setInputFiles('input[type="file"]', {
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(content),
  });
}

async function gotoWizard() {
  await page.goto(`${FRONTEND_URL}/app/import`);
  await page.waitForLoadState('networkidle');
}

// ── Page ──────────────────────────────────────────────────────────

test.describe('Import page', () => {
  test('loads without console errors', async () => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await gotoWizard();
    await expect(page.getByRole('heading', { name: 'Bulk Import' })).toBeVisible();
    // A failed fetch or a React warning both land here; a clean console is the
    // cheapest proof the page is really wired up.
    expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
  });

  test('shows all five wizard steps', async () => {
    await gotoWizard();
    for (const label of ['Upload', 'Map Columns', 'Preview', 'Execute', 'Complete']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('offers every importable entity, from the registry', async () => {
    await gotoWizard();
    // Previously hardcoded to Customer and Order only.
    //
    // Polled rather than read once: the list is fetched, so networkidle can
    // fire before React has rendered the options.
    await expect
      .poll(() => page.locator('#entity-type option').allTextContents(), { timeout: 10_000 })
      .toEqual(
        expect.arrayContaining(['Customers', 'Orders', 'Drivers', 'Vehicles', 'Expenses']),
      );
  });
});

// ── Upload ────────────────────────────────────────────────────────

test.describe('Upload step', () => {
  test('Upload is disabled until both an entity and a file are chosen', async () => {
    await gotoWizard();
    const upload = page.getByRole('button', { name: /Upload & Parse/ });
    await expect(upload).toBeDisabled();

    await page.locator('#entity-type').selectOption('Customer');
    await expect(upload).toBeDisabled();

    await attachCsv('c.csv', 'Company Name,Contact Name\nAcme,Jane');
    await expect(upload).toBeEnabled();
  });

  test('surfaces a rejected file as a readable message', async () => {
    await gotoWizard();
    await page.locator('#entity-type').selectOption('Customer');
    await attachCsv('empty.csv', '');
    await page.getByRole('button', { name: /Upload & Parse/ }).click();
    // The rejection must reach the user, not fail silently.
    await expect(page.getByText(/empty|no data rows/i)).toBeVisible({ timeout: 10_000 });
  });

  test('downloads a CSV template that is a CSV, not a JSON envelope', async () => {
    await gotoWizard();
    await page.locator('#entity-type').selectOption('Customer');

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download Template/ }).click(),
    ]).then(([d]) => d);

    expect(download.suggestedFilename()).toBe('customer-import-template.csv');

    // Every other route is wrapped in { data: ... }; doing that to a download
    // yields a file whose bytes are JSON that Excel then opens as garbage.
    const stream = await download.createReadStream();
    const text = await new Promise<string>((resolve, reject) => {
      let out = '';
      stream.on('data', (c) => (out += c));
      stream.on('end', () => resolve(out));
      stream.on('error', reject);
    });
    expect(text).not.toContain('{"data"');
    expect(text).toContain('Company Name *');
  });
});

// ── Mapping ───────────────────────────────────────────────────────

test.describe('Mapping step', () => {
  test('auto-maps recognised headers and reports the row count', async () => {
    await gotoWizard();
    await page.locator('#entity-type').selectOption('Customer');
    await attachCsv(
      'map.csv',
      ['Company Name,Contact Person,E-Mail,Legacy Junk', 'Acme,Jane,j@a.test,zz'].join('\n'),
    );
    await page.getByRole('button', { name: /Upload & Parse/ }).click();

    await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('1 rows detected')).toBeVisible();

    await expect(page.getByLabel('Map column Company Name')).toHaveValue('companyName');
    // An alias, not an exact name — the auto-mapper earns its keep here.
    await expect(page.getByLabel('Map column Contact Person')).toHaveValue('contactName');
    await expect(page.getByLabel('Map column E-Mail')).toHaveValue('email');
    // Unknown columns are left for the user to decide about.
    await expect(page.getByLabel('Map column Legacy Junk')).toHaveValue('');
  });

  test('blocks Validate until every required field is mapped, and names the gaps', async () => {
    await gotoWizard();
    await page.locator('#entity-type').selectOption('Customer');
    await attachCsv('unmapped.csv', 'Col A,Col B\nAcme,Jane');
    await page.getByRole('button', { name: /Upload & Parse/ }).click();
    await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible({ timeout: 15_000 });

    // Neither header auto-maps, so both required fields are outstanding.
    await expect(page.getByText(/Not yet mapped:.*Company Name.*Contact Name/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Validate Rows/ })).toBeDisabled();

    await page.getByLabel('Map column Col A').selectOption('companyName');
    await expect(page.getByRole('button', { name: /Validate Rows/ })).toBeDisabled();

    await page.getByLabel('Map column Col B').selectOption('contactName');
    await expect(page.getByRole('button', { name: /Validate Rows/ })).toBeEnabled();
  });

  test("a hand-made mapping is actually sent, not discarded", async () => {
    // The wizard used to collect mapping state and never send it — validation
    // ran against the server's auto-detected guess, so a manual choice was
    // silently thrown away. Headers here map to nothing automatically, so the
    // rows can only validate if the user's choice reached the server.
    await gotoWizard();
    await page.locator('#entity-type').selectOption('Customer');
    await attachCsv('manual.csv', 'Col A,Col B\nManual Co,Manual Contact');
    await page.getByRole('button', { name: /Upload & Parse/ }).click();
    await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Map column Col A').selectOption('companyName');
    await page.getByLabel('Map column Col B').selectOption('contactName');
    await page.getByRole('button', { name: /Validate Rows/ }).click();

    await expect(page.getByRole('heading', { name: 'Preview Results' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('1 valid')).toBeVisible();
    // Proof the values landed on the fields the user picked. Exact, because
    // "Manual Co" substring-matches the "Manual Contact" cell beside it.
    await expect(page.getByRole('cell', { name: 'Manual Co', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Manual Contact', exact: true })).toBeVisible();
  });
});

// ── Preview ───────────────────────────────────────────────────────

test.describe('Preview step', () => {
  test('shows valid/invalid counts, the reasons, and what will be ignored', async () => {
    await gotoWizard();
    await page.locator('#entity-type').selectOption('Customer');
    await attachCsv(
      'mixed.csv',
      [
        'Company Name,Contact Name,Email,Ignored Column',
        `BW-${RUN} Good,Good Contact,good@x.test,zz`,
        ',No Company,bad-email,zz',
      ].join('\n'),
    );
    await page.getByRole('button', { name: /Upload & Parse/ }).click();
    await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Validate Rows/ }).click();

    await expect(page.getByRole('heading', { name: 'Preview Results' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('1 valid')).toBeVisible();
    await expect(page.getByText('1 invalid')).toBeVisible();

    // The reasons are what make the report actionable.
    await expect(page.getByText(/Company Name is required/)).toBeVisible();
    await expect(page.getByText(/valid email/)).toBeVisible();

    // Dropping a column silently would be worse than saying so.
    await expect(page.getByText(/Ignored columns.*Ignored Column/)).toBeVisible();

    await expect(page.getByText('New records')).toBeVisible();
    await expect(page.getByText('Est. time')).toBeVisible();
  });

  test('downloads the error report as a real CSV', async () => {
    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download Full Report/ }).click(),
    ]).then(([d]) => d);

    expect(download.suggestedFilename()).toMatch(/^import-errors-.*\.csv$/);
    const stream = await download.createReadStream();
    const text = await new Promise<string>((resolve, reject) => {
      let out = '';
      stream.on('data', (c) => (out += c));
      stream.on('end', () => resolve(out));
      stream.on('error', reject);
    });
    expect(text).not.toContain('{"data"');
    expect(text).toContain('"Row","Column","Severity","Message","Value"');
    expect(text).toContain('is required');
  });
});

// ── Execute ───────────────────────────────────────────────────────

test.describe('Execute step', () => {
  test('imports end to end and reports what actually happened', async () => {
    await gotoWizard();
    await page.locator('#entity-type').selectOption('Customer');
    await attachCsv(
      'exec.csv',
      [
        'Customer Code,Company Name,Contact Name,Credit Limit,Status',
        `BW-${RUN}-1,BW ${RUN} Alpha,Ann,1000,ACTIVE`,
        `BW-${RUN}-2,BW ${RUN} Beta,Bob,2000,ACTIVE`,
      ].join('\n'),
    );
    await page.getByRole('button', { name: /Upload & Parse/ }).click();
    await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Validate Rows/ }).click();
    await expect(page.getByRole('heading', { name: 'Preview Results' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('2 valid')).toBeVisible();

    await page.getByRole('button', { name: /Continue to Execute/ }).click();
    await expect(page.getByRole('heading', { name: 'Execute Import' })).toBeVisible();

    // The three strategies must all be offered before committing.
    await expect(page.getByText('Skip duplicates')).toBeVisible();
    await expect(page.getByText('Update duplicates')).toBeVisible();
    await expect(page.getByText('Fail on duplicates')).toBeVisible();

    await page.getByRole('button', { name: /Execute Import/ }).click();

    // The wizard used to declare success the instant execute was ACCEPTED —
    // before a row was written, and regardless of the outcome. It must now
    // report the real, polled result.
    await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Imported')).toBeVisible();
    await expect(page.getByText('Duration')).toBeVisible();

    const importedTile = page.locator('div').filter({ hasText: /^Imported2$/ }).first();
    await expect(importedTile).toBeVisible();
  });

  test('the imported records really exist', async () => {
    const res = await fetch(`${API_URL}/customers?search=BW-${RUN}&limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await res.json();
    expect(body.data.items.length).toBe(2);
  });

  test('re-importing the same file skips the duplicates', async () => {
    await gotoWizard();
    await page.locator('#entity-type').selectOption('Customer');
    await attachCsv(
      'dupe.csv',
      [
        'Customer Code,Company Name,Contact Name,Credit Limit,Status',
        `BW-${RUN}-1,BW ${RUN} Alpha,Ann,1000,ACTIVE`,
        `BW-${RUN}-2,BW ${RUN} Beta,Bob,2000,ACTIVE`,
      ].join('\n'),
    );
    await page.getByRole('button', { name: /Upload & Parse/ }).click();
    await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Validate Rows/ }).click();
    await expect(page.getByRole('heading', { name: 'Preview Results' })).toBeVisible({ timeout: 20_000 });

    // A duplicate is a decision, not invalid data — it must still be importable.
    await expect(page.getByText('2 valid')).toBeVisible();
    await expect(page.getByText(/already exists/).first()).toBeVisible();

    await page.getByRole('button', { name: /Continue to Execute/ }).click();
    await page.getByRole('button', { name: /Execute Import/ }).click();
    await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible({ timeout: 30_000 });

    const skippedTile = page.locator('div').filter({ hasText: /^Skipped2$/ }).first();
    await expect(skippedTile).toBeVisible();
  });
});

// ── History ───────────────────────────────────────────────────────

test.describe('History', () => {
  test('lists the imports this run created', async () => {
    await page.goto(`${FRONTEND_URL}/app/import/history`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Import History' })).toBeVisible();
    await expect(page.getByText('exec.csv').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Failed to load/i)).toHaveCount(0);
  });

  test('the entity filter is built from the registry', async () => {
    await page.goto(`${FRONTEND_URL}/app/import/history`);
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => page.locator('select').first().locator('option').allTextContents(), {
        timeout: 10_000,
      })
      .toEqual(
        expect.arrayContaining(['Customers', 'Orders', 'Drivers', 'Vehicles', 'Expenses']),
      );
  });

  test('opens an import detail with its full statistics', async () => {
    await page.goto(`${FRONTEND_URL}/app/import/history`);
    await page.waitForLoadState('networkidle');

    // Navigation is the row's explicit View action, not the filename cell.
    const row = page.getByRole('row').filter({ hasText: 'exec.csv' }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'View' }).click();

    await expect(page.getByRole('heading', { name: 'Import Detail' })).toBeVisible({ timeout: 10_000 });
    for (const label of ['Total Rows', 'Valid', 'Invalid', 'Processed', 'Imported', 'Updated', 'Failed']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    // A COMPLETED import offers none of the lifecycle actions — each is only
    // shown in the state the server accepts it in.
    await expect(page.getByRole('button', { name: /Resume Import/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Cancel Import/ })).toHaveCount(0);
  });
});

// ── Permissions ───────────────────────────────────────────────────

test.describe('Permissions', () => {
  test('a role with no import rights cannot reach the API', async () => {
    // A DRIVER may import nothing; the registry, not the controller, decides.
    const reg = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `imp-perm-${RUN}@example.com`,
        password: 'test-password-123',
        firstName: 'Perm',
        lastName: 'Check',
        organizationName: `Imp Perm ${RUN}`,
      }),
    });
    const other = (await reg.json()).data;

    // A fresh org's admin CAN import, and sees only its own (empty) history.
    const history = await fetch(`${API_URL}/import/sessions`, {
      headers: { Authorization: `Bearer ${other.accessToken}` },
    });
    expect(history.status).toBe(200);
    expect((await history.json()).data.items).toHaveLength(0);
  });

  test('unauthenticated requests are rejected', async () => {
    const res = await fetch(`${API_URL}/import/sessions`);
    expect(res.status).toBe(401);
  });
});
