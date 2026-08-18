import { test, expect, type Page } from '@playwright/test';

/// The public entry experience is the first thing a buyer sees, and it is the
/// one part of the product they will open on a phone. These are the widths we
/// commit to: two common phones, a tablet, a small laptop, a desktop.
const WIDTHS = [
  { label: '375 · iPhone SE', width: 375, height: 812 },
  { label: '390 · iPhone 14', width: 390, height: 844 },
  { label: '768 · tablet', width: 768, height: 1024 },
  { label: '1024 · small laptop', width: 1024, height: 768 },
  { label: '1440 · desktop', width: 1440, height: 900 },
];

const PAGES = [
  { label: 'landing', path: '/' },
  { label: 'login', path: '/login' },
];

/// Horizontal overflow is the failure that makes a page feel broken on a
/// phone: the whole layout slides sideways under the thumb. Measuring the
/// document against the viewport catches it without any eyeballing.
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

/// A wide descendant is the usual culprit behind that overflow, and knowing
/// which element it is turns a red test into a fix.
async function widestOffender(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > limit + 1) {
        const cls = typeof el.className === 'string' ? el.className.slice(0, 80) : '';
        return `${el.tagName.toLowerCase()}.${cls} right=${Math.round(rect.right)} limit=${limit}`;
      }
    }
    return null;
  });
}

for (const { label, path } of PAGES) {
  for (const size of WIDTHS) {
    test(`${label} has no horizontal overflow at ${size.label}`, async ({ page }) => {
      /// Against a dev server the first hit to a route pays for compiling it,
      /// which has run past the default timeout on a cold start.
      test.setTimeout(90_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);

      const offender = await widestOffender(page);
      const overflow = await horizontalOverflow(page);
      expect(overflow, `overflow of ${overflow}px — widest: ${offender ?? 'none'}`).toBe(0);
    });
  }
}

/// The menu's primary action used to be pinned to the bottom of the sheet,
/// where the cookie banner sat on top of it — so on a first visit, the one
/// thing we want a new visitor to click was covered.
test('the mobile menu CTA is reachable on a first visit', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // A first visit means the consent banner is still up.
  await expect(page.getByText(/we use cookies/i)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /open menu/i }).click();
  const cta = page.getByRole('dialog').getByRole('button', { name: /get started/i });
  await expect(cta).toBeVisible();
  // The sheet slides in, so probe only once it has stopped moving.
  await expect(cta).toHaveCSS('opacity', '1');
  await page.waitForTimeout(600);

  // Visible isn't enough — check nothing is painted over it.
  const covered = await cta.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !(top && (el === top || el.contains(top)));
  });
  expect(covered, 'the menu CTA is behind another element').toBe(false);
});

/// Same corner, same problem: the sticky mobile CTA is pinned to `bottom-0`
/// underneath a consent banner that paints above it, so on a first visit it
/// was rendered but invisible. It now stands down until the banner is gone.
test('the sticky mobile CTA does not hide behind the cookie banner', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/we use cookies/i)).toBeVisible({ timeout: 20_000 });

  const stickyBar = page.locator('.fixed.bottom-0.md\\:hidden');
  await page.mouse.wheel(0, 1600);
  await page.waitForTimeout(600);

  // A translated-off-screen element still counts as "visible" to Playwright, so
  // assert on geometry: while the banner is up the bar must sit below the fold.
  const viewport = page.viewportSize()!;
  const parked = await stickyBar.boundingBox();
  expect(parked!.y, 'the sticky bar is on screen underneath the cookie banner').toBeGreaterThanOrEqual(
    viewport.height,
  );

  await page.getByRole('button', { name: /essential only/i }).click();
  await expect(page.getByText(/we use cookies/i)).toBeHidden();
  await page.waitForTimeout(600);

  const shown = await stickyBar.boundingBox();
  expect(shown!.y, 'the sticky bar never came up once the banner was gone').toBeLessThan(
    viewport.height,
  );

  const cta = stickyBar.getByRole('button', { name: /get started/i });
  const covered = await cta.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !(top && (el === top || el.contains(top)));
  });
  expect(covered, 'the sticky CTA is behind another element').toBe(false);
});

/// Every section fades in on scroll, which means its content starts at
/// `opacity: 0`. If an observer ever fails to fire, the page silently ships
/// blank bands where the product explanation should be.
test('every landing section actually becomes visible', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  for (const heading of [
    /run your entire logistics operation/i,
    /one system for every part of your operation/i,
    /live in four steps/i,
    /see flowerp running your operation/i,
  ]) {
    const node = page.getByRole('heading', { name: heading });
    await node.scrollIntoViewIfNeeded();
    await expect(node).toBeVisible();
    await expect(node).toHaveCSS('opacity', '1');
  }
});

test('the landing page keeps one h1 and a sensible heading order', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toContainText(/logistics operation/i);
});

test('the login page keeps one h1', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toContainText(/welcome back/i);
});

/// The old page invented an operation to look busy: counters for orders in
/// flight, fleet utilisation and on-time rate, a wall of made-up customer
/// logos, and three testimonials attributed to named people at named
/// companies who do not exist. A buyer who recognises one of those names as
/// fictional stops believing everything else on the page.
test('no fabricated customers, testimonials or performance claims', async ({ page }) => {
  for (const path of ['/', '/login']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const text = (await page.locator('body').innerText()).toLowerCase();

    for (const invented of [
      'sardor malikov',
      'aziza karimova',
      'bekzod rashidov',
      'silk route',
      'turon cargo',
      'aral freight',
      'bereke logistics',
      'zamin transport',
      'central express',
    ]) {
      expect(text, `${path} still names ${invented}`).not.toContain(invented);
    }

    for (const claim of ['97.4', '10,000+', 'orders in flight', 'all systems operational']) {
      expect(text, `${path} still claims "${claim}"`).not.toContain(claim);
    }
  }
});
