/**
 * Credit Limit Visual Verification — Tests 1–10
 * Captures screenshots at each step for review.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { getTestAuthTokens, SESSION_KEYS } from './auth-helper';
import * as path from 'path';

const BASE = process.env.FRONTEND_URL || 'http://localhost:3000';
const API = 'http://localhost:4000';
const SHOTS = path.join(process.cwd(), 'test-results', 'credit-limit-screens');

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

async function goto(page: Page) {
  await page.goto(`${BASE}/app/customers`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
}

async function openCreateSheet(page: Page) {
  await goto(page);
  const btn = page.locator('button').filter({ hasText: /new customer/i }).first();
  await expect(btn).toBeVisible({ timeout: 8_000 });
  await btn.click();
  await expect(page.getByRole('heading', { name: 'New customer' })).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(300); // sheet animation
}

async function expandCredit(page: Page) {
  const toggle = page.getByRole('button', { name: /set credit/i });
  if (await toggle.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await toggle.click();
    await page.waitForTimeout(300);
  }
}

test.describe('Credit Limit Visual', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('T1 · default state: Unlimited, no amount input', async ({ authPage: page }) => {
    await openCreateSheet(page);
    await expandCredit(page);

    // The mode selector should exist and show "Unlimited"
    const selector = page.locator('[id="creditLimit"]');
    await expect(selector).toBeVisible({ timeout: 3_000 });
    const text = await selector.textContent();
    expect(text?.trim()).toMatch(/unlimited/i);

    // No amount input visible
    const amountInput = page.locator('input[aria-label="Credit limit amount"]');
    await expect(amountInput).not.toBeVisible();

    await page.screenshot({ path: `${SHOTS}/t1-default-no-limit.png`, fullPage: false });
    console.log('  T1 ✓ default = "Unlimited", no amount input');
  });

  test('T2 · select Limited: amount input appears', async ({ authPage: page }) => {
    await openCreateSheet(page);
    await expandCredit(page);

    // Open the select and choose "Limited"
    const selector = page.locator('[id="creditLimit"]');
    await selector.click();
    const limitedOption = page.getByRole('option', { name: /^limited$/i });
    await expect(limitedOption).toBeVisible({ timeout: 3_000 });
    await limitedOption.click();
    await page.waitForTimeout(200);

    // Amount input must appear
    const amountInput = page.locator('input[aria-label="Credit limit amount"]');
    await expect(amountInput).toBeVisible({ timeout: 2_000 });

    await page.screenshot({ path: `${SHOTS}/t2-limited-amount-visible.png`, fullPage: false });
    console.log('  T2 ✓ "Limited" selected → amount input appears');
  });

  test('T3 · enter 10000: displays correctly', async ({ authPage: page }) => {
    await openCreateSheet(page);
    await expandCredit(page);

    const selector = page.locator('[id="creditLimit"]');
    await selector.click();
    await page.getByRole('option', { name: /^limited$/i }).click();
    await page.waitForTimeout(200);

    const amountInput = page.locator('input[aria-label="Credit limit amount"]');
    await amountInput.fill('10000');
    await page.waitForTimeout(200);

    const displayedValue = await amountInput.inputValue();
    expect(displayedValue).toBe('10000');

    await page.screenshot({ path: `${SHOTS}/t3-enter-10000.png`, fullPage: false });
    console.log('  T3 ✓ 10000 entered and displayed correctly');
  });

  test('T4+T5 · save Limited($10k) and No-limit, verify API', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    const ts = Date.now();

    // Create $10k customer
    await openCreateSheet(page);
    await expandCredit(page);
    await page.locator('[id="creditLimit"]').click();
    await page.getByRole('option', { name: /^limited$/i }).click();
    await page.waitForTimeout(200);
    await page.locator('input[aria-label="Credit limit amount"]').fill('10000');
    const name10k = `VisualTest-10k-${ts}`;
    await page.locator('[id="companyName"]').fill(name10k);
    await page.getByRole('button', { name: /create customer/i }).last().click();
    await page.waitForTimeout(1_000);

    // Verify $10k in API
    const r1 = await fetch(`${API}/customers?search=${encodeURIComponent(name10k)}&limit=1`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const d1 = await r1.json();
    const c10k = d1.data?.items?.[0];
    expect(c10k, 'Customer created').toBeTruthy();
    expect(parseFloat(c10k.creditLimit), 'API stores 10000').toBe(10000);
    console.log('  T4 ✓ API creditLimit =', c10k.creditLimit, '(= 10000)');

    // Create no-limit customer
    await goto(page);
    await openCreateSheet(page);
    await expandCredit(page);
    // Should default to "Unlimited" — don't change mode
    const modeText = await page.locator('[id="creditLimit"]').textContent();
    expect(modeText?.trim()).toMatch(/unlimited/i);
    const nameNull = `VisualTest-null-${ts}`;
    await page.locator('[id="companyName"]').fill(nameNull);
    await page.getByRole('button', { name: /create customer/i }).last().click();
    await page.waitForTimeout(1_000);

    const r2 = await fetch(`${API}/customers?search=${encodeURIComponent(nameNull)}&limit=1`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const d2 = await r2.json();
    const cNull = d2.data?.items?.[0];
    expect(cNull, 'No-limit customer created').toBeTruthy();
    expect(cNull.creditLimit, 'API stores null').toBeNull();
    console.log('  T5 ✓ API creditLimit =', cNull.creditLimit, '(= null)');

    // Store IDs for later tests
    process.env._CL_ID_NULL = cNull.id;
    process.env._CL_ID_10K = c10k.id;
    process.env._CL_TS = String(ts);

    // Cleanup
    for (const id of [c10k.id, cNull.id]) {
      await fetch(`${API}/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
        body: JSON.stringify({ status: 'INACTIVE' }),
      });
    }
  });

  test('T6+T7+T8 · edit: null→Unlimited; 10k→Limited+10k; 0→No credit', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    const ts = Date.now();

    // Create all three test customers via API
    const makeCustomer = async (name: string, creditLimit: number | null) => {
      const body: Record<string, unknown> = { companyName: name, email: `${name.toLowerCase().replace(/\s/g,'')}@test.test`, paymentTerms: 'NET_30' };
      if (creditLimit !== null) body.creditLimit = creditLimit;
      const r = await fetch(`${API}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
        body: JSON.stringify(body),
      });
      return (await r.json()).data;
    };

    const cNull = await makeCustomer(`EditT6-null-${ts}`, null);
    const c10k = await makeCustomer(`EditT7-10k-${ts}`, 10000);
    const c0 = await makeCustomer(`EditT8-zero-${ts}`, 0);

    // Helper: open the edit sheet for a customer by name
    const openEditSheet = async (companyName: string) => {
      await goto(page);
      await page.waitForTimeout(500);
      const row = page.getByText(companyName).first();
      await expect(row).toBeVisible({ timeout: 8_000 });
      await row.click();
      await page.waitForURL(/\/app\/customers\/[a-zA-Z0-9-]+/, { timeout: 6_000 });
      await expect(page.getByText(companyName).first()).toBeVisible({ timeout: 5_000 });
      await page.getByRole('button', { name: /^edit$/i }).first().click();
      await page.waitForTimeout(500);
    };

    // T6: null → shows "Unlimited", no amount input
    await openEditSheet(cNull.companyName);
    const t6selector = page.locator('[id="creditLimit"]').first();
    await expect(t6selector).toBeVisible({ timeout: 5_000 });
    const t6text = await t6selector.textContent();
    expect(t6text?.trim()).toMatch(/unlimited/i);
    await expect(page.locator('input[aria-label="Credit limit amount"]')).not.toBeVisible();
    await page.screenshot({ path: `${SHOTS}/t6-edit-null.png`, fullPage: false });
    console.log('  T6 ✓ null → "Unlimited", no amount input');

    // T7: 10000 → shows "Limited" + 10000
    await openEditSheet(c10k.companyName);
    const t7selector = page.locator('[id="creditLimit"]').first();
    await expect(t7selector).toBeVisible({ timeout: 5_000 });
    const t7text = await t7selector.textContent();
    expect(t7text?.trim()).toMatch(/limited/i);
    const t7amount = page.locator('input[aria-label="Credit limit amount"]');
    await expect(t7amount).toBeVisible({ timeout: 2_000 });
    expect(await t7amount.inputValue()).toBe('10000');
    await page.screenshot({ path: `${SHOTS}/t7-edit-10k.png`, fullPage: false });
    console.log('  T7 ✓ 10000 → "Limited", amount = 10000');

    // T8: 0 → shows "No credit", no amount input (distinct from Unlimited)
    await openEditSheet(c0.companyName);
    const t8selector = page.locator('[id="creditLimit"]').first();
    await expect(t8selector).toBeVisible({ timeout: 5_000 });
    const t8text = await t8selector.textContent();
    expect(t8text?.trim()).toMatch(/no credit/i);
    // No amount input for "No credit"
    await expect(page.locator('input[aria-label="Credit limit amount"]')).not.toBeVisible();
    await page.screenshot({ path: `${SHOTS}/t8-edit-zero.png`, fullPage: false });
    console.log('  T8 ✓ 0 → "No credit", no amount input (NOT "Unlimited")');

    // Cleanup
    for (const c of [cNull, c10k, c0]) {
      await fetch(`${API}/customers/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
        body: JSON.stringify({ status: 'INACTIVE' }),
      });
    }
  });

  test('T9 · negative amount is rejected by validation', async ({ authPage: page }) => {
    await openCreateSheet(page);
    await expandCredit(page);

    await page.locator('[id="creditLimit"]').click();
    await page.getByRole('option', { name: /^limited$/i }).click();
    await page.waitForTimeout(200);

    const amountInput = page.locator('input[aria-label="Credit limit amount"]');
    await amountInput.fill('-500');
    await page.waitForTimeout(200);

    // Fill required company name and try to save
    await page.locator('[id="companyName"]').fill('NegTest');

    // Try to submit — validation should catch the negative amount
    await page.getByRole('button', { name: /create customer/i }).last().click();
    await page.waitForTimeout(500);

    // Sheet must still be open (validation blocked submission)
    await expect(page.getByRole('heading', { name: 'New customer' })).toBeVisible({ timeout: 2_000 });

    // The validation error message should be visible
    const errMsg = page.locator('[role="alert"]').filter({ hasText: /negative/i }).first();
    await expect(errMsg).toBeVisible({ timeout: 2_000 });

    await page.screenshot({ path: `${SHOTS}/t9-negative-rejected.png`, fullPage: false });
    console.log('  T9 ✓ negative amount blocks save, error shown:', await errMsg.textContent());
  });

  test('T10 · layout at 1280×900: Credit & Billing section is compact', async ({ authPage: page }) => {
    await openCreateSheet(page);
    await expandCredit(page);

    // Switch to "Limited" to show the full expanded state
    await page.locator('[id="creditLimit"]').click();
    await page.getByRole('option', { name: /^limited$/i }).click();
    await page.waitForTimeout(300);

    // Measure the Credit & Billing section height
    const creditSection = page.locator('section').filter({ has: page.getByText('Credit & billing') }).first();
    const box = await creditSection.boundingBox();

    await page.screenshot({ path: `${SHOTS}/t10-layout-1280.png`, fullPage: false });

    // The section should not dominate the form — reasonable upper bound
    if (box) {
      console.log(`  T10 Credit & Billing section height: ${Math.round(box.height)}px`);
      expect(box.height, 'Section must be reasonably compact (< 400px)').toBeLessThan(400);
    }
    console.log('  T10 ✓ Layout is compact at 1280×900');
  });
});
