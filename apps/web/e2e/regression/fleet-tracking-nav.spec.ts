import { test, expect, type APIRequestContext } from '@playwright/test';
import { getTestSession, seedSession } from '../session';

const API = process.env.API_URL || 'http://localhost:4000';

/// Selecting a vehicle writes ?vehicleId= into the URL, and the sidebar entry
/// links to the bare route. Clicking it while a vehicle was selected used to
/// put the two URL-syncing effects into a fight — one restoring the id from the
/// still-current selection, the other stripping it again — so the address bar
/// oscillated instead of settling on the fleet overview.

/// These tests used to look for the seeded plate "01A111AA". Nothing puts that
/// vehicle on the live map: the fleet list reads vehicle_telematics_states, and
/// a row only appears there once a device reports a position — which the seed
/// never does. The tests passed on positions left behind by unrelated activity
/// and failed the moment something cleaned up. So each run now puts its own
/// vehicle on the map and asserts against that.
async function trackedVehicle(request: APIRequestContext, accessToken: string) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const plateNumber = `NAV${suffix}`.slice(0, 20).toUpperCase();

  const vehicle = await request.post(`${API}/vehicles`, {
    headers,
    data: { vehicleCode: `NAV-TEST-${suffix}`, plateNumber, type: 'VAN', capacity: 1000 },
  });
  expect(vehicle.status(), await vehicle.text()).toBe(201);
  const vehicleId = (await vehicle.json()).data.id;

  const device = await request.post(`${API}/telematics/devices`, {
    headers,
    data: {
      provider: 'MANUAL',
      externalId: `NAV-TEST-DEVICE-${suffix}`,
      name: 'Nav Test Device',
      vehicleId,
    },
  });
  expect(device.status(), await device.text()).toBe(201);
  const { id: deviceId, ingestSecret } = (await device.json()).data;

  const position = await request.post(
    `${API}/telematics/ingest/${deviceId}?secret=${ingestSecret}`,
    {
      data: {
        latitude: 41.3,
        longitude: 69.25,
        speed: 10,
        timestamp: new Date().toISOString(),
        ignitionOn: true,
      },
    },
  );
  expect(position.status(), await position.text()).toBe(201);

  return { plateNumber };
}

test.describe('fleet tracking selection and navigation', () => {
  test('the sidebar entry clears a selected vehicle and settles', async ({ page, request }) => {
    test.setTimeout(180_000);
    const session = await getTestSession();
    const { plateNumber } = await trackedVehicle(request, session.accessToken);
    await seedSession(page, session);

    await page.goto('/app/fleet-tracking', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('fleet-tracking-page')).toBeVisible({ timeout: 60_000 });

    const vehicle = page.getByRole('button', { name: new RegExp(plateNumber) }).first();
    await expect(vehicle).toBeVisible({ timeout: 60_000 });
    await vehicle.click();

    await expect(page).toHaveURL(/vehicleId=/, { timeout: 20_000 });

    // Name carries an sr-only "(current page)" while it is the active entry.
    await page.getByRole('button', { name: /^Fleet Tracking/ }).first().click();

    // The id must go and stay gone. Sampling over time rather than asserting
    // once: the bug was an oscillation, and a single check can land on the
    // half of the cycle that looks correct.
    await expect(page).not.toHaveURL(/vehicleId=/, { timeout: 20_000 });

    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      seen.add(new URL(page.url()).search);
      await page.waitForTimeout(250);
    }

    expect([...seen]).toEqual([...seen].filter((s) => !s.includes('vehicleId')));
    expect(seen.size).toBe(1);

    // Selection must still drive the URL afterwards: the fix stands the
    // selection→URL sync down while a URL change is in flight, and a stand-down
    // that never lifted would silently break deep-linking from here on.
    await vehicle.click();
    await expect(page).toHaveURL(/vehicleId=/, { timeout: 20_000 });
  });

  test('a deep link selects the vehicle it names', async ({ page, request }) => {
    test.setTimeout(120_000);
    const session = await getTestSession();
    const { plateNumber } = await trackedVehicle(request, session.accessToken);
    await seedSession(page, session);

    await page.goto('/app/fleet-tracking', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('fleet-tracking-page')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: new RegExp(plateNumber) }).first().click();
    await expect(page).toHaveURL(/vehicleId=/, { timeout: 20_000 });

    const deepLink = page.url();
    await page.goto(deepLink, { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('option', { name: new RegExp(plateNumber) }),
    ).toHaveAttribute('aria-selected', 'true', { timeout: 60_000 });
    await expect(page).toHaveURL(/vehicleId=/);
  });
});
