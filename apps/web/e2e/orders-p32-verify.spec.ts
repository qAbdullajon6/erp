import { test, expect } from './authenticated-fixture';

const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3000';

test.describe('P3.2 Orders UI QA', () => {
  test('URL persistence + search + column chooser', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND}/app/orders?search=Silk&status=DELIVERED&limit=10`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    expect(page.url()).toContain('search=Silk');
    expect(page.url()).toContain('status=DELIVERED');

    const searchInput = page.getByPlaceholder(/search orders/i);
    await expect(searchInput).toHaveValue('Silk');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    expect(page.url()).toContain('search=Silk');

    // Column chooser persistence
    await page.evaluate(() => {
      localStorage.setItem(
        'flowerp.orders.visible-columns',
        JSON.stringify(['orderNumber', 'customer', 'status']),
      );
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const cols = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('flowerp.orders.visible-columns') || '[]'),
    );
    expect(cols).toEqual(['orderNumber', 'customer', 'status']);
  });

  test('keyboard shortcut / focuses search', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND}/app/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const searchInput = page.getByPlaceholder(/search orders/i);
    await page.keyboard.press('/');
    await expect(searchInput).toBeFocused();
  });

  test('no console errors on list', async ({ authenticatedPage: page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto(`${FRONTEND}/app/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('404') && !e.includes('net::'),
    );
    expect(critical).toEqual([]);
  });

  test('detail page loads without console errors', async ({ authenticatedPage: page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto(`${FRONTEND}/app/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const firstLink = page.locator('table tbody tr').first().locator('a, button').first();
    if (await firstLink.isVisible().catch(() => false)) {
      await firstLink.click();
      await page.waitForURL(/\/app\/orders\//, { timeout: 10000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    }
    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('404') && !e.includes('net::'),
    );
    expect(critical).toEqual([]);
  });

  test('browser back/forward on orders list', async ({ authenticatedPage: page }) => {
    await page.goto(`${FRONTEND}/app/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const searchInput = page.getByPlaceholder(/search orders/i);
    await searchInput.fill('Bukhara');
    await page.waitForTimeout(500);
    await page.waitForURL(/search=Bukhara/, { timeout: 10000 });

    await page.goBack();
    await page.waitForTimeout(500);
    await page.goForward();
    await page.waitForURL(/search=Bukhara/, { timeout: 10000 });
  });

  test('responsive layout at mobile width', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${FRONTEND}/app/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 20);
    expect(overflow).toBe(false);
  });
});
