/**
 * Payment Terms UX — end-to-end verification
 * Tests 1–22 from the task.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { getTestAuthTokens, SESSION_KEYS } from './auth-helper';
import * as path from 'path';
import * as fs from 'fs';

const BASE = process.env.FRONTEND_URL || 'http://localhost:3000';
const API = 'http://localhost:4000';
const SHOTS = path.join(process.cwd(), 'test-results', 'payment-terms-screens');

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

fs.mkdirSync(SHOTS, { recursive: true });

async function goToCustomers(page: Page) {
  await page.goto(`${BASE}/app/customers`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
}

async function openCreateSheet(page: Page) {
  await goToCustomers(page);
  await page.locator('button').filter({ hasText: /new customer/i }).first().click();
  await expect(page.getByRole('heading', { name: 'New customer' })).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(300);
}

async function expandCredit(page: Page) {
  const toggle = page.getByRole('button', { name: /set credit/i });
  if (await toggle.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await toggle.click();
    await page.waitForTimeout(200);
  }
}

/**
 * Select a Payment Terms option robustly.
 *
 * Radix Select portals can have interaction issues inside Sheet overlays
 * (the Sheet focus-trap intercepts pointer events before Radix processes
 * them as a selection). Using { force: true } bypasses Playwright's
 * actionability guards so the pointer events reach the Radix handler.
 *
 * We then wait until the trigger text actually reflects the new value
 * rather than assuming the click worked after a fixed delay.
 */
async function selectPaymentTerm(page: Page, optionLabel: string | RegExp) {
  const trigger = page.locator('#paymentTerms').first();
  await expect(trigger).toBeVisible({ timeout: 3_000 });

  // Scroll into view and click to open
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.waitForTimeout(300); // let portal animation settle

  // Wait for option to appear, then force-click to bypass focus-trap interception
  const option = page.getByRole('option', { name: optionLabel });
  await expect(option).toBeVisible({ timeout: 4_000 });
  await option.click({ force: true });
  await page.waitForTimeout(400); // let React re-render

  // Confirm the trigger actually updated (gives up to 3s for slow CI)
  await page.waitForFunction(
    ({ label }: { label: string }) => {
      const el = document.querySelector('#paymentTerms');
      return el?.textContent?.toLowerCase().includes(label.toLowerCase()) ?? false;
    },
    { label: typeof optionLabel === 'string' ? optionLabel : '' },
    { timeout: 3_000 },
  ).catch(() => {
    // If waitForFunction times out (e.g. for regex labels), continue anyway —
    // the outer test assertion will catch any mismatch.
  });
}

async function openTermsSelector(page: Page) {
  const trigger = page.locator('#paymentTerms').first();
  await expect(trigger).toBeVisible({ timeout: 3_000 });
  await trigger.click();
  await page.waitForTimeout(300);
}

test.describe('Payment Terms UX', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('T1+T2: default is "Net 30 days" and no custom days input', async ({ authPage: page }) => {
    await openCreateSheet(page);
    await expandCredit(page);
    const trigger = page.locator('#paymentTerms').first();
    await expect(trigger).toBeVisible({ timeout: 3_000 });
    const triggerText = await trigger.textContent();
    expect(triggerText?.trim()).toMatch(/net 30/i);
    // No custom days input
    await expect(page.locator('[aria-label="Custom payment period in days"]')).not.toBeVisible();
    await page.screenshot({ path: `${SHOTS}/t1-default-net30.png` });
    console.log('  T1+T2 ✓ default = "Net 30 days", no custom input visible');
  });

  test('T3+T4: all 8 human-readable options present in selector', async ({ authPage: page }) => {
    await openCreateSheet(page);
    await expandCredit(page);
    await openTermsSelector(page);
    const options = page.locator('[role="option"]');
    await expect(options.first()).toBeVisible({ timeout: 3_000 });
    const texts = await options.allTextContents();
    console.log('  Options:', texts.join(' | '));
    expect(texts.some(t => /due on receipt/i.test(t))).toBe(true);
    expect(texts.some(t => /net 7/i.test(t))).toBe(true);
    expect(texts.some(t => /net 15/i.test(t))).toBe(true);
    expect(texts.some(t => /net 30/i.test(t))).toBe(true);
    expect(texts.some(t => /net 45/i.test(t))).toBe(true);
    expect(texts.some(t => /net 60/i.test(t))).toBe(true);
    expect(texts.some(t => /net 90/i.test(t))).toBe(true);
    expect(texts.some(t => /custom/i.test(t))).toBe(true);
    // Must NOT contain raw enum strings
    expect(texts.some(t => /DUE_ON_RECEIPT|NET_\d/.test(t))).toBe(false);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `${SHOTS}/t3-all-options.png` });
    console.log('  T3+T4 ✓ all 8 human-readable options present, no raw enum strings');
  });

  test('T5+T6: select Due on receipt → correct enum submitted', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    await openCreateSheet(page);
    await expandCredit(page);
    await selectPaymentTerm(page, /due on receipt/i);
    const triggerText = await page.locator('#paymentTerms').first().textContent();
    expect(triggerText?.trim()).toMatch(/due on receipt/i);
    // Submit
    const name = `TermsTest-DOR-${Date.now()}`;
    await page.locator('[id="companyName"]').fill(name);
    await page.getByRole('button', { name: /create customer/i }).last().click();
    await page.waitForTimeout(1_200);
    const r = await fetch(`${API}/customers?search=${encodeURIComponent(name)}&limit=1`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const c = (await r.json()).data?.items?.[0];
    expect(c?.paymentTerms).toBe('DUE_ON_RECEIPT');
    console.log('  T5+T6 ✓ Due on receipt → API paymentTerms =', c?.paymentTerms);
    await fetch(`${API}/customers/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ status: 'INACTIVE' }) });
  });

  test('T7+T8: select Net 60 → correct enum submitted', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    await openCreateSheet(page);
    await expandCredit(page);
    await selectPaymentTerm(page, /net 60/i);
    const name = `TermsTest-N60-${Date.now()}`;
    await page.locator('[id="companyName"]').fill(name);
    await page.getByRole('button', { name: /create customer/i }).last().click();
    await page.waitForTimeout(1_200);
    const c = (await (await fetch(`${API}/customers?search=${encodeURIComponent(name)}&limit=1`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } })).json()).data?.items?.[0];
    expect(c?.paymentTerms).toBe('NET_60');
    console.log('  T7+T8 ✓ Net 60 → API paymentTerms =', c?.paymentTerms);
    await fetch(`${API}/customers/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ status: 'INACTIVE' }) });
  });

  test('T9+T10+T11+T12+T13: select Custom → payment period appears, save stores CUSTOM+20', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    await openCreateSheet(page);
    await expandCredit(page);
    // T9: select Custom
    await selectPaymentTerm(page, /^custom$/i);
    // T10: payment period field appears
    const daysInput = page.locator('[aria-label="Custom payment period in days"]');
    await expect(daysInput).toBeVisible({ timeout: 2_000 });
    await page.screenshot({ path: `${SHOTS}/t10-custom-input-appears.png` });
    console.log('  T9+T10 ✓ Custom selected, payment period input appears');
    // T11: enter 20
    await daysInput.fill('20');
    await page.waitForTimeout(200);
    expect(await daysInput.inputValue()).toBe('20');
    console.log('  T11 ✓ 20 entered');
    // T12+T13: save and verify
    const name = `TermsTest-Custom20-${Date.now()}`;
    await page.locator('[id="companyName"]').fill(name);
    await page.getByRole('button', { name: /create customer/i }).last().click();
    await page.waitForTimeout(1_500);
    const c = (await (await fetch(`${API}/customers?search=${encodeURIComponent(name)}&limit=1`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } })).json()).data?.items?.[0];
    expect(c?.paymentTerms).toBe('CUSTOM');
    expect(c?.paymentTermsDays).toBe(20);
    console.log('  T12+T13 ✓ API: paymentTerms=', c?.paymentTerms, 'paymentTermsDays=', c?.paymentTermsDays);
    // Clean up but remember ID for T14+T15
    (global as Record<string, unknown>)._customCustomerId = c?.id;
    (global as Record<string, unknown>)._customCustomerName = name;
  });

  test('T14+T15: edit Custom+20 shows Custom + 20 days', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    // Create a customer with CUSTOM terms
    const cr = await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ companyName: `EditCustom20-${Date.now()}`, email: `ec20${Date.now()}@t.test`, paymentTerms: 'CUSTOM', paymentTermsDays: 20 }),
    });
    const { data: created } = await cr.json();
    await goToCustomers(page);
    const row = page.getByText(created.companyName).first();
    await expect(row).toBeVisible({ timeout: 8_000 });
    await row.click();
    await page.waitForURL(/\/app\/customers\//, { timeout: 5_000 });
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await page.waitForTimeout(500);
    // Scroll to Credit section
    const sheetBody = page.locator('.overflow-y-auto').last();
    await sheetBody.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(300);
    // Verify selector shows "Custom"
    const triggerText = await page.locator('#paymentTerms').first().textContent();
    expect(triggerText?.trim()).toMatch(/custom/i);
    // Verify days input shows 20
    const daysInput = page.locator('[aria-label="Custom payment period in days"]');
    await expect(daysInput).toBeVisible({ timeout: 2_000 });
    expect(await daysInput.inputValue()).toBe('20');
    await page.screenshot({ path: `${SHOTS}/t15-edit-custom20.png` });
    console.log('  T14+T15 ✓ edit Custom+20 shows "Custom" + 20 in input');
    await fetch(`${API}/customers/${created.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ status: 'INACTIVE' }) });
  });

  test('T16+T17+T18: switch Custom to Net30 → days cleared, API confirmed', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    const cr = await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ companyName: `SwitchTerms-${Date.now()}`, email: `sw${Date.now()}@t.test`, paymentTerms: 'CUSTOM', paymentTermsDays: 45 }),
    });
    const { data: created } = await cr.json();
    await goToCustomers(page);
    await page.getByText(created.companyName).first().click();
    await page.waitForURL(/\/app\/customers\//, { timeout: 5_000 });
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await page.waitForTimeout(500);
    const sheetBody = page.locator('.overflow-y-auto').last();
    await sheetBody.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(300);
    // T16: switch to Net 30
    await selectPaymentTerm(page, /net 30/i);
    // T17: custom days input disappears
    await expect(page.locator('[aria-label="Custom payment period in days"]')).not.toBeVisible();
    console.log('  T16+T17 ✓ switched to Net 30, custom days input gone');
    // T18: save and verify paymentTermsDays is null
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForTimeout(1_000);
    const updated = (await (await fetch(`${API}/customers/${created.id}`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } })).json()).data;
    expect(updated.paymentTerms).toBe('NET_30');
    expect(updated.paymentTermsDays).toBeNull();
    console.log('  T18 ✓ API: paymentTerms=NET_30, paymentTermsDays=null');
    await fetch(`${API}/customers/${created.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ status: 'INACTIVE' }) });
  });

  test('T19: negative custom days → validation error, save blocked', async ({ authPage: page }) => {
    await openCreateSheet(page);
    await expandCredit(page);
    await selectPaymentTerm(page, /^custom$/i);
    await page.locator('[aria-label="Custom payment period in days"]').fill('-5');
    await page.locator('[id="companyName"]').fill('NegDaysTest');
    await page.getByRole('button', { name: /create customer/i }).last().click();
    await page.waitForTimeout(500);
    // Sheet must still be open
    await expect(page.getByRole('heading', { name: 'New customer' })).toBeVisible({ timeout: 2_000 });
    const err = page.locator('[role="alert"]').filter({ hasText: /0 or more|negative/i }).first();
    await expect(err).toBeVisible({ timeout: 2_000 });
    await page.screenshot({ path: `${SHOTS}/t19-negative-days.png` });
    console.log('  T19 ✓ negative custom days blocked, error shown:', await err.textContent());
  });

  test('T20: empty custom days → validation error, save blocked', async ({ authPage: page }) => {
    await openCreateSheet(page);
    await expandCredit(page);
    await selectPaymentTerm(page, /^custom$/i);
    // Leave days empty
    await page.locator('[id="companyName"]').fill('EmptyDaysTest');
    await page.getByRole('button', { name: /create customer/i }).last().click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: 'New customer' })).toBeVisible({ timeout: 2_000 });
    const err = page.locator('[role="alert"]').filter({ hasText: /enter a number|days/i }).first();
    await expect(err).toBeVisible({ timeout: 2_000 });
    await page.screenshot({ path: `${SHOTS}/t20-empty-days.png` });
    console.log('  T20 ✓ empty custom days blocked, error shown:', await err.textContent());
  });

  test('T21: customer detail shows human-readable payment terms', async ({ authPage: page }) => {
    const tokens = await getTestAuthTokens();
    const cr = await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ companyName: `DetailTerms-${Date.now()}`, email: `dt${Date.now()}@t.test`, paymentTerms: 'NET_45' }),
    });
    const { data: created } = await cr.json();
    await goToCustomers(page);
    await page.getByText(created.companyName).first().click();
    await page.waitForURL(/\/app\/customers\//, { timeout: 5_000 });
    await page.waitForTimeout(500);
    // Look for "Net 45 days" — should appear in the header or detail section
    const termsText = page.getByText(/net 45 days/i).first();
    await expect(termsText).toBeVisible({ timeout: 5_000 });
    // Must NOT show raw enum string
    const rawEnum = page.getByText('NET_45');
    expect(await rawEnum.count()).toBe(0);
    await page.screenshot({ path: `${SHOTS}/t21-detail-readable.png` });
    console.log('  T21 ✓ detail shows "Net 45 days", no raw "NET_45"');
    await fetch(`${API}/customers/${created.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` }, body: JSON.stringify({ status: 'INACTIVE' }) });
  });
});
