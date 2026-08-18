import { expect, test, type APIRequestContext } from '@playwright/test';

const API = process.env.API_URL || 'http://localhost:4000';
const PASSWORD = 'FlowERP-Test-2026!';

/// A sidebar link a role cannot use is worse than no link: it 403s on click.
/// These expectations mirror each controller's read-role list.
///
/// Two labels are asserted hidden for every tenant role:
///   Leads         — FlowERP staff only. It belongs to the Platform Console
///                   shell, which the case below covers separately.
///   Integrations  — the screen calls /api/admin/integrations/*, which no
///                   controller serves. It was removed from navigation rather
///                   than left as a link to a page of 404s.
///
/// Configuration screens (Billing, Data import, Automation, Developer,
/// Activity log) are Settings children: they render underneath Settings once
/// you are inside that section, so they are deliberately absent from /app.
const EXPECTED: Record<string, { email: string; visible: string[]; hidden: string[] }> = {
  ADMIN: {
    email: 'admin@flowerp.test',
    visible: [
      'Overview',
      'Orders',
      'Dispatch',
      'Customers',
      'Fleet Tracking',
      'Drivers',
      'Vehicles',
      'Finance',
      'Reports',
      'Settings',
    ],
    hidden: ['Leads', 'My Deliveries', 'Integrations', 'Billing'],
  },
  OPERATIONS_MANAGER: {
    email: 'ops-manager@flowerp.test',
    visible: ['Orders', 'Dispatch', 'Customers', 'Fleet Tracking', 'Drivers', 'Vehicles', 'Finance', 'Reports'],
    hidden: ['Leads', 'My Deliveries', 'Integrations'],
  },
  DISPATCHER: {
    email: 'dispatcher@flowerp.test',
    visible: ['Orders', 'Dispatch', 'Customers', 'Fleet Tracking', 'Drivers', 'Vehicles', 'Finance', 'Reports'],
    hidden: ['Leads', 'My Deliveries', 'Integrations'],
  },
  ACCOUNTANT: {
    email: 'accountant@flowerp.test',
    visible: ['Orders', 'Dispatch', 'Customers', 'Finance', 'Reports'],
    hidden: ['Drivers', 'Vehicles', 'Fleet Tracking', 'Leads', 'My Deliveries', 'Integrations'],
  },
  SALES_CRM_MANAGER: {
    email: 'sales@flowerp.test',
    visible: ['Orders', 'Customers', 'Finance', 'Reports'],
    hidden: ['Dispatch', 'Drivers', 'Vehicles', 'Fleet Tracking', 'Leads', 'My Deliveries', 'Integrations'],
  },
};

/// One real login per account — seven in all, past the /auth/login throttle of
/// 5/min per IP. CI runs the API with NODE_ENV=test, where the ThrottlerGuard
/// is never registered (see app.module.ts), so the suite sails through. Against
/// a dev API the later logins get a 429, so back off and retry rather than
/// weakening a brute-force guard that is doing its job.
test.describe.configure({ mode: 'serial' });

async function loginAs(request: APIRequestContext, email: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    if (response.status() !== 429) return response;
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error(`login for ${email} kept returning 429`);
}

async function signIn(page: import('@playwright/test').Page, request: APIRequestContext, email: string) {
  const login = await loginAs(request, email);
  expect(login.status(), `login for ${email}`).toBe(200);
  const { accessToken, refreshToken } = (await login.json()).data;

  await page.addInitScript(
    ([a, r]) => {
      sessionStorage.setItem('flowerp_access_token', a);
      sessionStorage.setItem('flowerp_refresh_token', r);
    },
    [accessToken, refreshToken],
  );
}

/// FlowERP staff do not get the tenant sidebar with extra links bolted on —
/// /app hands them over to the Platform Console, which is a separate shell.
/// Proving the two do not bleed into each other is what this case is for.
test('FlowERP staff land in the Platform Console, not the tenant shell', async ({ page, request }) => {
  test.setTimeout(300_000);
  await signIn(page, request, 'platform@flowerp.test');
  await page.goto('/app', { waitUntil: 'domcontentloaded' });

  // The console shell renders its nav outside an <aside>, unlike the tenant
  // shell, so this one is scoped to the page.
  await expect(page.getByRole('button', { name: 'Organizations', exact: true })).toBeVisible({
    timeout: 60_000,
  });

  const shown = (await page.getByRole('button').allInnerTexts()).map((l) => l.trim()).filter(Boolean);
  for (const label of ['Organizations', 'Leads', 'Subscriptions']) {
    expect(shown, `platform staff should see "${label}"`).toContain(label);
  }
  for (const label of ['Orders', 'Dispatch', 'Customers', 'Fleet Tracking', 'Integrations']) {
    expect(shown, `platform console should not carry the tenant screen "${label}"`).not.toContain(label);
  }
});

/// A driver gets DriverAppShell — a mobile-first layout with a three-tab
/// bottom bar, not the admin sidebar. None of the admin screens exist in it at
/// all, which is stronger than hiding links.
test('a driver gets the driver shell, with none of the admin screens', async ({ page, request }) => {
  test.setTimeout(300_000);
  await signIn(page, request, 'driver@flowerp.test');
  await page.goto('/app', { waitUntil: 'domcontentloaded' });

  const bottomNav = page.getByLabel('Driver navigation');
  await expect(bottomNav).toBeVisible({ timeout: 60_000 });

  const shown = (await bottomNav.getByRole('link').allInnerTexts()).map((l) => l.trim()).filter(Boolean);
  expect(shown).toEqual(['Home', 'Jobs', 'Account']);

  await expect(page.locator('[data-sidebar="sidebar"]')).toHaveCount(0);
});

for (const [role, spec] of Object.entries(EXPECTED)) {
  test(`sidebar for ${role} shows only screens the API will serve`, async ({ page, request }) => {
    test.setTimeout(300_000);

    await signIn(page, request, spec.email);

    await page.goto('/app', { waitUntil: 'domcontentloaded' });

    // The shell renders the shadcn Sidebar as a div, not an <aside> — scope to
    // its data attribute rather than a landmark that is not there.
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await expect(sidebar.getByRole('button', { name: 'Settings', exact: true })).toBeVisible({ timeout: 60_000 });

    const labels = await sidebar.getByRole('button').allInnerTexts();
    // The active row carries an sr-only "(current page)" for screen readers,
    // which lands in innerText.
    const shown = labels.map((l) => l.replace(/\(current page\)/, '').trim()).filter(Boolean);
    console.log(`${role}: ${shown.join(', ')}`);

    for (const label of spec.visible) {
      expect(shown, `${role} should see "${label}"`).toContain(label);
    }
    for (const label of spec.hidden) {
      expect(shown, `${role} should NOT see "${label}"`).not.toContain(label);
    }
  });
}
