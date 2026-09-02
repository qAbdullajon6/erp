/**
 * Support Drawer — functional verification
 *
 * Verifies:
 * 1. Support icon is visible in the header
 * 2. Clicking it opens the drawer
 * 3. Current page remains visible underneath (no route change)
 * 4. Clicking outside (overlay) closes the drawer
 * 5. Escape key closes the drawer
 * 6. Drawer renders key elements (title, AI shortcut, new ticket button)
 * 7. Existing Notifications bell still works
 * 8. Drawer is responsive at mobile width
 */

import { test as base, expect, type Page } from '@playwright/test';
import { getTestAuthTokens, SESSION_KEYS } from './auth-helper';

const BASE = process.env.FRONTEND_URL || 'http://localhost:3000';

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

async function goToApp(page: Page) {
  await page.goto(`${BASE}/app/customers`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
}

test.describe('Support Drawer', () => {
  test('1 · Support icon is visible in the header', async ({ authPage: page }) => {
    await goToApp(page);
    const btn = page.getByRole('button', { name: /support/i });
    await expect(btn).toBeVisible({ timeout: 8_000 });
    console.log('  ✓ Support icon visible in header');
  });

  test('2 · Clicking support icon opens the drawer', async ({ authPage: page }) => {
    await goToApp(page);
    const btn = page.getByRole('button', { name: /support/i });
    await btn.click();

    // Drawer heading appears
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });
    console.log('  ✓ Drawer opened with "Support" heading');
  });

  test('3 · Current page URL does not change when drawer opens', async ({ authPage: page }) => {
    await goToApp(page);
    const urlBefore = page.url();

    const btn = page.getByRole('button', { name: /support/i });
    await btn.click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });

    expect(page.url()).toBe(urlBefore);
    console.log('  ✓ URL unchanged after drawer open:', urlBefore);
  });

  test('4 · Escape key closes the drawer', async ({ authPage: page }) => {
    await goToApp(page);
    const btn = page.getByRole('button', { name: /support/i });
    await btn.click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Support' })).not.toBeVisible({ timeout: 3_000 });
    console.log('  ✓ Escape closes drawer');
  });

  test('5 · Clicking outside (overlay) closes the drawer', async ({ authPage: page }) => {
    await goToApp(page);
    const btn = page.getByRole('button', { name: /support/i });
    await btn.click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });

    // Click the backdrop overlay (the dimmed area outside the sheet)
    await page.mouse.click(100, 400); // far left of the sheet
    await expect(page.getByRole('heading', { name: 'Support' })).not.toBeVisible({ timeout: 3_000 });
    console.log('  ✓ Clicking outside closes drawer');
  });

  test('6 · Drawer contains key UI elements', async ({ authPage: page }) => {
    await goToApp(page);
    await page.getByRole('button', { name: /support/i }).click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });

    // "How can we help?" subtitle
    await expect(page.getByText(/how can we help/i)).toBeVisible({ timeout: 2_000 });

    // AI shortcut
    await expect(page.getByText(/ask ai/i)).toBeVisible({ timeout: 2_000 });

    // Contact support CTA
    await expect(page.getByRole('button', { name: /contact support/i })).toBeVisible({ timeout: 2_000 });

    console.log('  ✓ Drawer shows subtitle, AI shortcut, and Contact support CTA');
  });

  test('7 · Notifications bell still opens its own drawer', async ({ authPage: page }) => {
    await goToApp(page);
    const bell = page.getByRole('button', { name: /notifications/i });
    await expect(bell).toBeVisible({ timeout: 5_000 });
    await bell.click();
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Notifications' })).not.toBeVisible({ timeout: 2_000 });
    console.log('  ✓ Notifications drawer unaffected');
  });

  test('8 · Drawer responsive at mobile width (390px)', async ({ authPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await goToApp(page);
    const btn = page.getByRole('button', { name: /support/i });
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await btn.click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });
    // Drawer should be full-width at mobile
    const sheetBox = await page.getByRole('dialog').boundingBox();
    expect(sheetBox?.width).toBeGreaterThan(300);
    console.log('  ✓ Drawer visible and wide at 390px viewport');
  });

  test('9 · New ticket form navigates within the drawer', async ({ authPage: page }) => {
    await goToApp(page);
    await page.getByRole('button', { name: /support/i }).click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });

    // Click "Contact support" or "New ticket"
    await page.getByRole('button', { name: /contact support/i }).click();
    await expect(page.getByRole('heading', { name: 'New ticket' })).toBeVisible({ timeout: 3_000 });

    // Back button returns to list
    await page.getByRole('button', { name: /back/i }).click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 3_000 });

    console.log('  ✓ New ticket form opens and back button returns to list');
  });
});
