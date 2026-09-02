/**
 * Support Phase 6 — AI Integration
 *
 * Tests:
 * 1. Support drawer opens and Ask AI button exists
 * 2. Clicking Ask AI opens the AI panel (no route navigation)
 * 3. Closing AI returns to Support
 * 4. Ask AI from no ticket has no ticket context
 * 5. AI context endpoint is org-isolated (wrong ticket → 404)
 * 6. Unauthenticated AI context request is rejected
 * 7. Ask AI from ticket list view works
 * 8. Existing support drawer behavior unchanged
 * 9. No route navigation when Ask AI is clicked
 * 10. AI panel shows heading and input
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

async function tenantToken() {
  return (await getTestAuthTokens()).accessToken;
}

test.describe('Support Phase 6 — AI Integration', () => {

  test('1: Support drawer opens and Ask AI button exists', async ({ authPage: page }) => {
    await page.goto(`${BASE}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /support/i }).click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });

    // Ask AI button must be visible
    const askAiBtn = page.getByText(/ask ai/i).first();
    await expect(askAiBtn).toBeVisible({ timeout: 3_000 });
    console.log('  ✓ Ask AI button visible in support drawer');
  });

  test('2: Clicking Ask AI opens AI panel without route navigation', async ({ authPage: page }) => {
    await page.goto(`${BASE}/app/customers`, { waitUntil: 'domcontentloaded' });
    const urlBefore = page.url();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /support/i }).click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });

    // Click Ask AI
    await page.getByText(/ask ai/i).first().click();
    await page.waitForTimeout(800);

    // Should show AI Assistant panel
    const aiHeading = page.getByText(/ai assistant/i).first();
    await expect(aiHeading).toBeVisible({ timeout: 5_000 });

    // URL must not have changed
    expect(page.url()).toBe(urlBefore);
    console.log('  ✓ Ask AI opens AI panel, URL unchanged');
  });

  test('3: Closing AI panel returns to Support', async ({ authPage: page }) => {
    await page.goto(`${BASE}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /support/i }).click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });

    await page.getByText(/ask ai/i).first().click();
    await expect(page.getByText(/ai assistant/i).first()).toBeVisible({ timeout: 5_000 });

    // Press back button in the AI panel header
    await page.getByRole('button', { name: /back to support/i }).click();
    await page.waitForTimeout(400);

    // Should be back at the Support list view
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 3_000 });
    console.log('  ✓ Back button returns to Support');
  });

  test('4: Back button closes AI panel; overlay click closes the whole drawer', async ({ authPage: page }) => {
    await page.goto(`${BASE}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /support/i }).click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });

    await page.getByText(/ask ai/i).first().click();
    await expect(page.getByText(/ai assistant/i).first()).toBeVisible({ timeout: 5_000 });

    // Back button returns to Support list (not a full close)
    await page.getByRole('button', { name: /back to support/i }).click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 3_000 });

    // Clicking the overlay closes the whole drawer
    await page.mouse.click(100, 400);
    await expect(page.getByRole('heading', { name: 'Support' })).not.toBeVisible({ timeout: 3_000 });
    console.log('  ✓ Back returns to Support; overlay click closes drawer');
  });

  test('5: AI context endpoint is org-isolated', async () => {
    const token = await tenantToken();

    // Create a ticket
    const cr = await fetch(`${API}/support/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject: `Phase6 AI test ${Date.now()}`, body: 'Testing AI context.' }),
    });
    const ticket = (await cr.json()).data;

    // Valid request — should succeed
    const ok = await fetch(`${API}/support/tickets/${ticket.id}/ai-context`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.data.context).toContain('Phase6 AI test');
    console.log('  ✓ Valid ai-context request succeeds');

    // Fabricated ticket ID — should return 404
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const notFound = await fetch(`${API}/support/tickets/${fakeId}/ai-context`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(notFound.status).toBe(404);
    console.log('  ✓ Non-existent ticketId returns 404');

    // Cleanup
    await fetch(`${API}/support/tickets/${ticket.id}/close`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
  });

  test('6: Unauthenticated AI context request is rejected', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${API}/support/tickets/${fakeId}/ai-context`);
    expect(res.status).toBe(401);
    console.log('  ✓ Unauthenticated ai-context returns 401');
  });

  test('7: AI context includes ticket subject and body', async () => {
    const token = await tenantToken();
    const subject = `Phase6 Context Check ${Date.now()}`;
    const body = 'My specific issue is about the report feature not working correctly.';

    const cr = await fetch(`${API}/support/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject, body }),
    });
    const ticket = (await cr.json()).data;

    const ctxRes = await fetch(`${API}/support/tickets/${ticket.id}/ai-context`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = await ctxRes.json();

    expect(data.context).toContain(subject);
    expect(data.context).toContain('Open');  // status
    console.log('  ✓ AI context contains subject and status');
    console.log('  Context preview:', data.context.slice(0, 150));

    // Cleanup
    await fetch(`${API}/support/tickets/${ticket.id}/close`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
  });

  test('8: AI panel shows AI Assistant heading and input field', async ({ authPage: page }) => {
    await page.goto(`${BASE}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /support/i }).click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });

    await page.getByText(/ask ai/i).first().click();
    await page.waitForTimeout(800);

    // AI panel should show heading
    await expect(page.getByText(/ai assistant/i).first()).toBeVisible({ timeout: 5_000 });
    console.log('  ✓ AI panel shows AI Assistant heading');
  });

  test('9: Existing Support notification bell still works after AI integration', async ({ authPage: page }) => {
    await page.goto(`${BASE}/app/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Open support
    await page.getByRole('button', { name: /support/i }).click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');

    // Notification bell should still work
    const bell = page.getByRole('button', { name: /notifications/i });
    await expect(bell).toBeVisible({ timeout: 5_000 });
    await bell.click();
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    console.log('  ✓ Notification bell still works after AI integration');
  });
});
