/**
 * Phase 2: Customer Address Search — end-to-end verification
 *
 * Verifies:
 * - AddressSearch suggestions via /api/geocoding/suggest proxy (never LocationIQ direct)
 * - Suggestion meta (city · postalCode) in the confirmation block
 * - Button state machine: idle "Pick" → suggestion "Verify" → map "Location confirmed"
 * - Map pin opens at selected address coords; reverse geocode via /api/geocoding/reverse
 * - City change clears address state
 * - Bukhara (UZ) and Berlin (DE) flows
 * - Edit sheet: existing customer with coords shows "Location confirmed" immediately
 * - No direct LocationIQ or Mapbox geocoding from the browser
 */

import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { getTestAuthTokens, SESSION_KEYS } from './auth-helper';

const BASE = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_BASE = 'http://localhost:4000';

// ─── Authenticated fixture ────────────────────────────────────────────────────

const test = base.extend<{ authPage: Page }>({
  authPage: async ({ page }, use) => {
    const tokens = await getTestAuthTokens();
    await page.addInitScript(
      ({ ak, rk, at, rt }: { ak: string; rk: string; at: string; rt: string }) => {
        sessionStorage.setItem(ak, at);
        if (rt) sessionStorage.setItem(rk, rt);
      },
      { ak: SESSION_KEYS.ACCESS_TOKEN, rk: SESSION_KEYS.REFRESH_TOKEN, at: tokens.accessToken, rt: tokens.refreshToken },
    );
    await use(page);
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function goToCustomers(page: Page) {
  await page.goto(`${BASE}/app/customers`, { waitUntil: 'networkidle' });
  if (page.url().includes('/login')) throw new Error('Auth failed: redirected to /login');
}

async function openCreateSheet(page: Page) {
  await goToCustomers(page);
  const btn = page.locator('button').filter({ hasText: /new customer/i }).first();
  await expect(btn).toBeVisible({ timeout: 8_000 });
  await btn.click();
  await expect(page.getByRole('heading', { name: 'New customer' })).toBeVisible({ timeout: 5_000 });
}

async function expandAddress(page: Page) {
  const toggle = page.getByRole('button', { name: /add address/i });
  if (await toggle.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await toggle.click();
  }
}

async function selectCountry(page: Page, countryName: string) {
  await page.locator('#country').first().click();
  const input = page.locator('[cmdk-input]').last();
  await input.fill(countryName);
  const item = page.locator('[cmdk-item]').filter({ hasText: countryName }).first();
  await expect(item).toBeVisible({ timeout: 5_000 });
  await item.click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

async function selectCity(page: Page, cityName: string) {
  const trigger = page.locator('#city').first();
  await expect(trigger).not.toBeDisabled({ timeout: 4_000 });
  await trigger.click();
  const input = page.locator('[cmdk-input]').last();
  await input.fill(cityName);
  const item = page.locator('[cmdk-item]').filter({ hasText: cityName }).first();
  await expect(item).toBeVisible({ timeout: 8_000 });
  await item.click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

/** Mock the suggest endpoint intelligently: city queries return a city stub,
 *  all other queries return addressResults. This avoids CitySelect getting
 *  address data when it's searching for city names. */
async function mockSuggestWithCity(
  context: BrowserContext,
  cityName: string,
  cityCoords: { lat: number; lng: number },
  addressResults: object[],
) {
  // Remove any existing route first to avoid stacking
  await context.unroute('**/api/geocoding/suggest**');
  await context.route('**/api/geocoding/suggest**', async (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get('q') ?? '').toLowerCase().trim();
    const cityLower = cityName.toLowerCase();
    // If the query looks like a city search (matches the city name prefix), return city stub
    if (cityLower.startsWith(q.slice(0, 4)) || q.startsWith(cityLower.slice(0, 4))) {
      await route.fulfill({
        json: [{
          id: `city-mock-${cityLower.replace(/\s/g, '-')}`,
          name: cityName,
          city: cityName,
          postalCode: null,
          region: null,
          countryName: null,
          placeName: cityName,
          lat: cityCoords.lat,
          lng: cityCoords.lng,
        }],
      });
    } else {
      await route.fulfill({ json: addressResults });
    }
  });
}

async function mockReverse(context: BrowserContext, result: object) {
  await context.unroute('**/api/geocoding/reverse**');
  await context.route('**/api/geocoding/reverse**', async (route) => {
    await route.fulfill({ json: result });
  });
}

async function getAddressSearchBtn(page: Page) {
  // AddressSearch trigger has role="combobox", not "button"
  return page.locator('[role="combobox"]').filter({ hasText: /search street address/i }).first();
}

async function pickAddressSuggestion(page: Page, labelText: string) {
  const btn = await getAddressSearchBtn(page);
  await expect(btn).toBeVisible({ timeout: 4_000 });
  await btn.click();
  const input = page.locator('[cmdk-input]').last();
  await input.fill(labelText.slice(0, 8));
  await page.waitForTimeout(700);
  const item = page.locator('[cmdk-item]').filter({ hasText: labelText }).first();
  await expect(item).toBeVisible({ timeout: 5_000 });
  await item.click();
}

// ─── Test data ────────────────────────────────────────────────────────────────

const TASHKENT = { lat: 41.2995, lng: 69.2401 };
const BUKHARA = { lat: 39.7747, lng: 64.4286 };
const BERLIN = { lat: 52.5170, lng: 13.3888 };

const ADDR_TASHKENT = [{ id: 'uz-s1', name: "Serquyosh ko'chasi", city: 'Tashkent', postalCode: '100015', region: 'Toshkent', countryName: 'Uzbekistan', placeName: "Serquyosh ko'chasi, Tashkent", ...TASHKENT }];
const ADDR_BUKHARA = [{ id: 'uz-b1', name: "Mustaqillik ko'chasi", city: 'Bukhara', postalCode: '200100', region: 'Buxoro viloyati', countryName: 'Uzbekistan', placeName: "Mustaqillik ko'chasi, Bukhara", ...BUKHARA }];
const ADDR_BERLIN = [{ id: 'de-1', name: 'Unter den Linden 1', city: 'Berlin', postalCode: '10117', region: 'Berlin', countryName: 'Germany', placeName: 'Unter den Linden 1, 10117 Berlin', ...BERLIN }];
const REV_TASHKENT = { street: "Serquyosh ko'chasi 7", city: 'Tashkent', region: null, country: 'Uzbekistan', postalCode: '100015', placeName: "Serquyosh ko'chasi 7, Tashkent" };

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Phase 2 — Address Search', () => {

  test('T01 · no direct LocationIQ or Mapbox geocode calls from browser', async ({ authPage: page, context }) => {
    const directLiq: string[] = [];
    const directMapboxGeo: string[] = [];
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('locationiq.com')) directLiq.push(u);
      if (u.includes('api.mapbox.com/geocoding')) directMapboxGeo.push(u);
    });

    await mockSuggestWithCity(context, 'Tashkent', TASHKENT, ADDR_TASHKENT);
    await openCreateSheet(page);
    await expandAddress(page);
    await selectCountry(page, 'Uzbekistan');
    await selectCity(page, 'Tashkent');

    // Trigger an address suggest call
    const addrBtn = await getAddressSearchBtn(page);
    if (await addrBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addrBtn.click();
      await page.locator('[cmdk-input]').last().fill('Serq');
      await page.waitForTimeout(800);
    }

    expect(directLiq, 'No direct LocationIQ calls').toHaveLength(0);
    expect(directMapboxGeo, 'No direct Mapbox geocode calls').toHaveLength(0);
    console.log('✅ T01: no direct LocationIQ / Mapbox geocoding from browser');
  });

  test('T02 · suggest proxied via /api/geocoding/suggest with country param', async ({ authPage: page, context }) => {
    const suggestCalls: URL[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/geocoding/suggest')) suggestCalls.push(new URL(req.url()));
    });

    await mockSuggestWithCity(context, 'Tashkent', TASHKENT, ADDR_TASHKENT);
    await openCreateSheet(page);
    await expandAddress(page);
    await selectCountry(page, 'Uzbekistan');
    await selectCity(page, 'Tashkent');

    await (await getAddressSearchBtn(page)).click();
    await page.locator('[cmdk-input]').last().fill('Serquyosh');
    await page.waitForTimeout(700);

    await expect(page.locator('[cmdk-item]').first()).toBeVisible({ timeout: 5_000 });

    // All suggest calls must go through the proxy
    const addressSuggestCalls = suggestCalls.filter(u => !['tash', 'tashk', 'tashke'].some(prefix => (u.searchParams.get('q') ?? '').toLowerCase().startsWith(prefix)));
    expect(addressSuggestCalls.length, 'Address suggest must be called').toBeGreaterThan(0);
    for (const u of addressSuggestCalls) {
      expect(u.pathname).toBe('/api/geocoding/suggest');
      expect(u.host).not.toContain('locationiq');
    }
    const last = addressSuggestCalls[addressSuggestCalls.length - 1];
    expect(last.searchParams.get('country')?.toUpperCase()).toBe('UZ');
    console.log('✅ T02: address suggest proxied with country=UZ');
  });

  test('T03 · button state: idle → Verify → Location confirmed', async ({ authPage: page, context }) => {
    await mockSuggestWithCity(context, 'Tashkent', TASHKENT, ADDR_TASHKENT);
    await mockReverse(context, REV_TASHKENT);

    await openCreateSheet(page);
    await expandAddress(page);
    await selectCountry(page, 'Uzbekistan');
    await selectCity(page, 'Tashkent');

    // State 1: idle
    await expect(page.getByRole('button', { name: /pick location on map/i })).toBeVisible({ timeout: 3_000 });
    console.log('  State 1: "Pick location on map" ✓');

    // Select address
    await pickAddressSuggestion(page, "Serquyosh ko'chasi");

    // State 2: "Verify location on map" + selected address block
    await expect(page.getByRole('button', { name: /verify location on map/i })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/selected address/i)).toBeVisible({ timeout: 2_000 });
    await expect(page.getByText('100015')).toBeVisible({ timeout: 2_000 });
    console.log('  State 2: "Verify location on map" + postal 100015 ✓');

    // Open map and confirm
    await page.getByRole('button', { name: /verify location on map/i }).click();
    const dialog = page.locator('[data-testid="map-picker-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 6_000 });
    await dialog.getByRole('button', { name: /use this location/i }).click();

    // State 3: "Location confirmed"
    await expect(page.getByRole('button', { name: /location confirmed/i })).toBeVisible({ timeout: 6_000 });
    await expect(page.getByText(/confirmed address/i)).toBeVisible({ timeout: 2_000 });
    await expect(page.getByText(/Serquyosh ko'chasi 7/)).toBeVisible({ timeout: 2_000 });
    console.log('  State 3: "Location confirmed — Move pin" + confirmed address ✓');
  });

  test('T04 · city clear resets address state to idle', async ({ authPage: page, context }) => {
    await mockSuggestWithCity(context, 'Tashkent', TASHKENT, [
      { id: 'c1', name: 'Test Street', city: 'Tashkent', postalCode: '100099', region: null, countryName: 'Uzbekistan', placeName: 'Test Street, Tashkent', ...TASHKENT },
    ]);

    await openCreateSheet(page);
    await expandAddress(page);
    await selectCountry(page, 'Uzbekistan');
    await selectCity(page, 'Tashkent');
    await pickAddressSuggestion(page, 'Test Street');

    await expect(page.getByRole('button', { name: /verify location on map/i })).toBeVisible({ timeout: 3_000 });

    // Clear city
    const cityTrigger = page.locator('#city').first();
    await cityTrigger.locator('[aria-label="Clear city"]').click();

    // Back to idle
    await expect(page.getByRole('button', { name: /pick location on map/i })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/selected address/i)).not.toBeVisible({ timeout: 2_000 });
    console.log('✅ T04: city clear → "Pick location on map"');
  });

  test('T05 · Bukhara (UZ) — suggest proxy with country=UZ', async ({ authPage: page, context }) => {
    const calls: URL[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/geocoding/suggest')) calls.push(new URL(req.url()));
    });

    await mockSuggestWithCity(context, 'Bukhara', BUKHARA, ADDR_BUKHARA);
    await openCreateSheet(page);
    await expandAddress(page);
    await selectCountry(page, 'Uzbekistan');
    await selectCity(page, 'Bukhara');
    await pickAddressSuggestion(page, "Mustaqillik ko'chasi");

    await expect(page.getByRole('button', { name: /verify location on map/i })).toBeVisible({ timeout: 3_000 });

    const addrCalls = calls.filter(u => (u.searchParams.get('q') ?? '').toLowerCase().includes('must'));
    expect(addrCalls.length).toBeGreaterThan(0);
    expect(addrCalls[0].searchParams.get('country')?.toUpperCase()).toBe('UZ');
    expect(addrCalls[0].host).not.toContain('locationiq');
    console.log('✅ T05: Bukhara proxy with country=UZ');
  });

  test('T06 · Berlin (DE) — works outside Uzbekistan, postal code shown', async ({ authPage: page, context }) => {
    const calls: URL[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/geocoding/suggest')) calls.push(new URL(req.url()));
    });

    await mockSuggestWithCity(context, 'Berlin', BERLIN, ADDR_BERLIN);
    await openCreateSheet(page);
    await expandAddress(page);
    await selectCountry(page, 'Germany');
    await selectCity(page, 'Berlin');
    await pickAddressSuggestion(page, 'Unter den Linden 1');

    await expect(page.getByRole('button', { name: /verify location on map/i })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText('10117')).toBeVisible({ timeout: 2_000 });

    const addrCalls = calls.filter(u => (u.searchParams.get('q') ?? '').toLowerCase().includes('unter'));
    expect(addrCalls[0]?.searchParams.get('country')?.toUpperCase()).toBe('DE');
    console.log('✅ T06: Berlin proxy with country=DE, postal 10117 shown');
  });

  test('T07 · /api/geocoding/reverse called on map confirm (not LocationIQ direct)', async ({ authPage: page, context }) => {
    const reverseCalls: string[] = [];
    const directLiq: string[] = [];
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/api/geocoding/reverse')) reverseCalls.push(u);
      if (u.includes('locationiq.com')) directLiq.push(u);
    });

    await mockSuggestWithCity(context, 'Tashkent', TASHKENT, [
      { id: 'rv1', name: 'Rev Street', city: 'Tashkent', postalCode: '100001', region: null, countryName: 'Uzbekistan', placeName: 'Rev Street, Tashkent', ...TASHKENT },
    ]);
    await mockReverse(context, { street: 'Rev Street 3', city: 'Tashkent', region: null, country: 'Uzbekistan', postalCode: '100001', placeName: 'Rev Street 3, Tashkent' });

    await openCreateSheet(page);
    await expandAddress(page);
    await selectCountry(page, 'Uzbekistan');
    await selectCity(page, 'Tashkent');
    await pickAddressSuggestion(page, 'Rev Street');

    await page.getByRole('button', { name: /verify location on map/i }).click();
    const dialog = page.locator('[data-testid="map-picker-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole('button', { name: /use this location/i }).click();

    await page.waitForTimeout(1_500);

    expect(reverseCalls.length, '/api/geocoding/reverse must be called').toBeGreaterThan(0);
    expect(directLiq, 'No direct LocationIQ from browser').toHaveLength(0);
    console.log('✅ T07: reverse geocode via proxy, not LocationIQ directly');
  });

  test('T08 · AddressSearch disabled before country is selected', async ({ authPage: page }) => {
    await openCreateSheet(page);
    await expandAddress(page);
    const btn = await getAddressSearchBtn(page);
    if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      expect(await btn.isDisabled()).toBeTruthy();
      console.log('✅ T08: AddressSearch is disabled without country');
    } else {
      console.log('✅ T08: AddressSearch not rendered without country (acceptable)');
    }
  });

  test('T09 · edit sheet: customer with coords shows "Location confirmed" immediately', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    const createRes = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({
        companyName: `P2-EditTest-${Date.now()}`,
        email: `p2edit${Date.now()}@example.test`,
        country: 'UZ', city: 'Tashkent',
        cityLat: 41.2995, cityLng: 69.2401,
        address: "Serquyosh ko'chasi", postalCode: '100015',
        paymentTerms: 'NET_30',
      }),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      console.warn('Create customer failed:', createRes.status, body.slice(0, 200));
      test.skip();
      return;
    }

    // Response is { data: { id, companyName, ... } }
    const json = await createRes.json() as { data: { id: string; companyName: string } };
    const customerId = json.data.id;
    const companyName = json.data.companyName;
    console.log('  Created:', companyName, customerId);

    await goToCustomers(page);
    const row = page.getByText(companyName).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Navigate to detail page and open the edit sheet
    await row.click();
    await page.waitForURL(/\/app\/customers\/[a-zA-Z0-9-]+/, { timeout: 6_000 });

    // Wait for customer detail to fully load (address card must be visible)
    await expect(page.getByText(/Serquyosh/)).toBeVisible({ timeout: 8_000 });

    // Click the Edit button (top header button)
    const editBtn = page.getByRole('button', { name: /^edit$/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 5_000 });
    await editBtn.click();

    // Wait for the edit sheet to open (heading contains customer name)
    await expect(page.getByRole('heading', { name: new RegExp(`Edit ${companyName}`) })).toBeVisible({ timeout: 5_000 });

    // Scroll the sheet body down to show the Address section (it's below Company/Contact)
    const sheetBody = page.locator('.overflow-y-auto').last();
    await sheetBody.evaluate((el) => el.scrollTop = el.scrollHeight);
    await page.waitForTimeout(400);

    // "Location confirmed — Move pin" should appear because customer.lat != null
    const confirmedBtn = page.locator('button').filter({ hasText: /location confirmed/i }).first();
    await expect(confirmedBtn).toBeVisible({ timeout: 6_000 });
    console.log('✅ T09: edit sheet shows "Location confirmed" for customer with existing coords');

    // Cleanup
    const freshTokens = await getTestAuthTokens();
    await fetch(`${API_BASE}/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshTokens.accessToken}` },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
  });
});
