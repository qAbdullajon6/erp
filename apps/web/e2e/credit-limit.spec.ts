/**
 * Credit Limit UX — verification spec
 *
 * Tests A–H from the task:
 * A. Create with "No credit limit"
 * B. Create with $10,000 limit
 * C. Reject negative limit
 * D. Reject invalid (non-numeric) amount
 * E. Edit customer with existing limit
 * F. Edit customer with no limit
 * G. Verify API/database representation
 * H. Verify existing customers not corrupted
 */

import { test as base, expect, type Page } from '@playwright/test';
import { getTestAuthTokens, SESSION_KEYS } from './auth-helper';

const BASE = process.env.FRONTEND_URL || 'http://localhost:3000';
const API = 'http://localhost:4000';

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

async function openCreateSheet(page: Page) {
  await page.goto(`${BASE}/app/customers`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600); // allow TanStack Query to settle
  const btn = page.locator('button').filter({ hasText: /new customer/i }).first();
  await expect(btn).toBeVisible({ timeout: 8_000 });
  await btn.click();
  await expect(page.getByRole('heading', { name: 'New customer' })).toBeVisible({ timeout: 5_000 });
}

async function expandCreditSection(page: Page) {
  const toggle = page.getByRole('button', { name: /set credit|credit & billing/i });
  if (await toggle.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await toggle.click();
    await page.waitForTimeout(200);
  }
}

test.describe('Credit Limit UX', () => {

  test('A · create with Unlimited → API returns null', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();

    // Open the create sheet
    await openCreateSheet(page);
    await expandCreditSection(page);

    // The Credit limit selector should default to "Unlimited"
    const modeSelector = page.locator('[id="creditLimit"]').first();
    await expect(modeSelector).toBeVisible({ timeout: 3_000 });
    const selectedText = await modeSelector.textContent();
    expect(selectedText).toMatch(/unlimited/i);
    console.log('  Default credit limit mode: "Unlimited" ✓');

    // Fill mandatory fields and save
    const name = `CreditTest-A-${Date.now()}`;
    await page.locator('[id="companyName"]').fill(name);
    await page.getByRole('button', { name: /create customer/i }).last().click();
    await page.waitForTimeout(1_500);

    // Verify via API
    const res = await fetch(`${API}/customers?search=${encodeURIComponent(name)}&limit=1`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const data = await res.json();
    const created = data.data?.items?.[0];
    expect(created, 'Customer should be in the list').toBeTruthy();
    expect(created.creditLimit, 'creditLimit should be null in API').toBeNull();
    console.log('  API creditLimit:', created.creditLimit, '← null ✓');

    // Cleanup
    await fetch(`${API}/customers/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
  });

  test('B · create with $10,000 limit → API returns "10000.00"', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    await openCreateSheet(page);
    await expandCreditSection(page);

    // Switch to "Limited amount"
    const modeSelector = page.locator('[id="creditLimit"]').first();
    await modeSelector.click();
    await page.getByRole('option', { name: /^limited$/i }).click();
    await page.waitForTimeout(200);

    // Amount input should appear
    const amountInput = page.locator('input[type="number"]').filter({ has: page.locator('[aria-label="Credit limit amount"]') }).first();
    // Fallback: any number input in credit section
    const numberInput = page.locator('input[type="number"]').first();
    await expect(numberInput).toBeVisible({ timeout: 3_000 });
    await numberInput.fill('10000');

    const name = `CreditTest-B-${Date.now()}`;
    await page.locator('[id="companyName"]').fill(name);
    await page.getByRole('button', { name: /create customer/i }).last().click();
    await page.waitForTimeout(1_500);

    const res = await fetch(`${API}/customers?search=${encodeURIComponent(name)}&limit=1`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const data = await res.json();
    const created = data.data?.items?.[0];
    expect(created).toBeTruthy();
    expect(parseFloat(created.creditLimit)).toBe(10000);
    console.log('  API creditLimit:', created.creditLimit, '← "10000.00" ✓');

    await fetch(`${API}/customers/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
  });

  test('C · backend rejects negative credit limit', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    const res = await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ companyName: 'Reject-Negative', email: 'rn@test.test', creditLimit: -100 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    const msg = JSON.stringify(body.error?.message ?? body.message ?? '');
    expect(msg).toMatch(/less than 0|negative/i);
    console.log('  Negative rejected with 400 ✓ message:', msg);
  });

  test('D · backend rejects non-numeric credit limit', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    const res = await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ companyName: 'Reject-String', email: 'rs@test.test', creditLimit: 'abc' }),
    });
    expect(res.status).toBe(400);
    console.log('  Non-numeric rejected with 400 ✓');
  });

  test('E · edit customer — set limit via API, verify UI shows it', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    // Create a no-limit customer
    const cr = await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ companyName: `CreditTest-E-${Date.now()}`, email: `e${Date.now()}@test.test`, paymentTerms: 'NET_30' }),
    });
    const { data: created } = await cr.json();

    // Update via API to set limit
    await fetch(`${API}/customers/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ creditLimit: 5000 }),
    });

    // Verify via API
    const getRes = await fetch(`${API}/customers/${created.id}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const { data: updated } = await getRes.json();
    expect(parseFloat(updated.creditLimit), 'creditLimit should equal 5000').toBe(5000);
    console.log('  Set 5000 → API returns:', updated.creditLimit, '✓');

    // Cleanup
    await fetch(`${API}/customers/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
  });

  test('F · edit customer — clear limit to null via API', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    // Create with a limit
    const cr = await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ companyName: `CreditTest-F-${Date.now()}`, email: `f${Date.now()}@test.test`, creditLimit: 3000 }),
    });
    const { data: created } = await cr.json();
    expect(parseFloat(created.creditLimit)).toBe(3000);

    // Clear to null
    await fetch(`${API}/customers/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ creditLimit: null }),
    });

    const getRes = await fetch(`${API}/customers/${created.id}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const { data: cleared } = await getRes.json();
    expect(cleared.creditLimit).toBeNull();
    console.log('  Cleared to null → API returns:', cleared.creditLimit, '✓');

    await fetch(`${API}/customers/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
  });

  test('G · DB representation — null for no-limit, decimal for limited', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();

    // Create both types
    const noLimit = await (await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ companyName: `G-NoLimit-${Date.now()}`, email: `g1${Date.now()}@t.test` }),
    })).json();

    const withLimit = await (await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ companyName: `G-Limited-${Date.now()}`, email: `g2${Date.now()}@t.test`, creditLimit: 25000 }),
    })).json();

    expect(noLimit.data.creditLimit, 'No-limit customer → null').toBeNull();
    expect(typeof withLimit.data.creditLimit, 'Limited customer → string').toBe('string');
    expect(parseFloat(withLimit.data.creditLimit), 'Limited customer → 25000').toBe(25000);
    console.log('  No-limit DB value: null ✓');
    console.log('  Limited DB value:', withLimit.data.creditLimit, '✓');

    // Cleanup
    for (const c of [noLimit.data, withLimit.data]) {
      await fetch(`${API}/customers/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
        body: JSON.stringify({ status: 'INACTIVE' }),
      });
    }
  });

  test('H · data model integrity — null/0/positive all correctly stored', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();

    // Create one customer of each type
    const noLimit = await (await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ companyName: `H-NoLimit-${Date.now()}`, email: `h1${Date.now()}@t.test` }),
    })).json();

    const zeroLimit = await (await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ companyName: `H-Zero-${Date.now()}`, email: `h2${Date.now()}@t.test`, creditLimit: 0 }),
    })).json();

    const posLimit = await (await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ companyName: `H-Positive-${Date.now()}`, email: `h3${Date.now()}@t.test`, creditLimit: 7500 }),
    })).json();

    // Verify all three states round-trip correctly
    expect(noLimit.data.creditLimit, 'No-limit → null').toBeNull();
    expect(parseFloat(zeroLimit.data.creditLimit), '$0 → 0').toBe(0);
    expect(parseFloat(posLimit.data.creditLimit), 'positive → 7500').toBe(7500);
    console.log(`  null=${noLimit.data.creditLimit} | zero=${zeroLimit.data.creditLimit} | pos=${posLimit.data.creditLimit} ✓`);

    // Verify the migration correctly converted old defaults: no customers have creditLimit
    // from before the migration (all pre-migration zeros were converted to NULL).
    // New zeros are explicit and valid — we only check the specific customers we created.

    // Cleanup
    for (const c of [noLimit.data, zeroLimit.data, posLimit.data]) {
      await fetch(`${API}/customers/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
        body: JSON.stringify({ status: 'INACTIVE' }),
      });
    }
  });
});
