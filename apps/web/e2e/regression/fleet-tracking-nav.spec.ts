import { test, expect } from '@playwright/test';
import { getTestSession, seedSession } from '../session';

/// Selecting a vehicle writes ?vehicleId= into the URL, and the sidebar entry
/// links to the bare route. Clicking it while a vehicle was selected used to
/// put the two URL-syncing effects into a fight — one restoring the id from the
/// still-current selection, the other stripping it again — so the address bar
/// oscillated instead of settling on the fleet overview.
test.describe('fleet tracking selection and navigation', () => {
  test('the sidebar entry clears a selected vehicle and settles', async ({ page }) => {
    test.setTimeout(180_000);
    await seedSession(page, await getTestSession());

    await page.goto('/app/fleet-tracking', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('fleet-tracking-page')).toBeVisible({ timeout: 60_000 });

    const vehicle = page.getByRole('button', { name: /01A111AA/ }).first();
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

  test('a deep link selects the vehicle it names', async ({ page }) => {
    test.setTimeout(120_000);
    await seedSession(page, await getTestSession());

    await page.goto('/app/fleet-tracking', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('fleet-tracking-page')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /01A111AA/ }).first().click();
    await expect(page).toHaveURL(/vehicleId=/, { timeout: 20_000 });

    const deepLink = page.url();
    await page.goto(deepLink, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('option', { name: /01A111AA/ })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 60_000 },
    );
    await expect(page).toHaveURL(/vehicleId=/);
  });
});
