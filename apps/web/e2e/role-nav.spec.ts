import { expect, test, type APIRequestContext } from '@playwright/test';

const API = process.env.API_URL || 'http://localhost:4000';
const PASSWORD = 'FlowERP-Test-2026!';

/// A sidebar link a role cannot use is worse than no link: it 403s on click.
/// These expectations mirror each controller's read-role list.
const EXPECTED: Record<string, { email: string; visible: string[]; hidden: string[] }> = {
  ADMIN: {
    email: 'admin@flowerp.test',
    visible: ['Overview', 'Orders', 'Dispatches', 'Customers', 'Drivers', 'Vehicles', 'Finance', 'Reports', 'Settings'],
    hidden: ['My Deliveries'],
  },
  OPERATIONS_MANAGER: {
    email: 'ops-manager@flowerp.test',
    visible: ['Orders', 'Dispatches', 'Customers', 'Drivers', 'Vehicles', 'Finance', 'Reports'],
    hidden: ['My Deliveries'],
  },
  DISPATCHER: {
    email: 'dispatcher@flowerp.test',
    visible: ['Orders', 'Dispatches', 'Customers', 'Drivers', 'Vehicles', 'Finance', 'Reports'],
    hidden: ['My Deliveries'],
  },
  ACCOUNTANT: {
    email: 'accountant@flowerp.test',
    visible: ['Orders', 'Dispatches', 'Customers', 'Finance', 'Reports'],
    hidden: ['Drivers', 'Vehicles', 'My Deliveries'],
  },
  SALES_CRM_MANAGER: {
    email: 'sales@flowerp.test',
    visible: ['Orders', 'Customers', 'Finance', 'Reports'],
    hidden: ['Dispatches', 'Drivers', 'Vehicles', 'My Deliveries'],
  },
  DRIVER: {
    email: 'driver@flowerp.test',
    visible: ['Overview', 'My Deliveries', 'Settings'],
    hidden: ['Orders', 'Dispatches', 'Customers', 'Drivers', 'Vehicles', 'Finance', 'Reports'],
  },
};

/// One real login per role — six in all, past the /auth/login throttle of
/// 5/min per IP. CI runs the API with NODE_ENV=test, where the ThrottlerGuard
/// is never registered (see app.module.ts), so the suite sails through. Against
/// a dev API the sixth login gets a 429, so back off and retry rather than
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

for (const [role, spec] of Object.entries(EXPECTED)) {
  test(`sidebar for ${role} shows only screens the API will serve`, async ({ page, request }) => {
    test.setTimeout(300_000);

    const login = await loginAs(request, spec.email);
    expect(login.status(), `login for ${role}`).toBe(200);
    const { accessToken, refreshToken } = (await login.json()).data;

    await page.addInitScript(
      ([a, r]) => {
        sessionStorage.setItem('flowerp_access_token', a);
        sessionStorage.setItem('flowerp_refresh_token', r);
      },
      [accessToken, refreshToken],
    );

    await page.goto('/app', { waitUntil: 'domcontentloaded' });

    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('button', { name: 'Settings', exact: true })).toBeVisible({ timeout: 60_000 });

    const labels = await sidebar.getByRole('button').allInnerTexts();
    const shown = labels.map((l) => l.trim()).filter(Boolean);
    console.log(`${role}: ${shown.join(', ')}`);

    for (const label of spec.visible) {
      expect(shown, `${role} should see "${label}"`).toContain(label);
    }
    for (const label of spec.hidden) {
      expect(shown, `${role} should NOT see "${label}"`).not.toContain(label);
    }
  });
}
