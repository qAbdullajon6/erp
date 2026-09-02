import { expect, type Locator, type Page } from '@playwright/test';

/** Wait for a heading or test id that signals the page finished loading. */
export async function waitForHeading(page: Page, name: RegExp | string): Promise<void> {
  await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 30_000 });
}

export async function waitForTestId(page: Page, testId: string): Promise<Locator> {
  const loc = page.getByTestId(testId);
  await expect(loc).toBeVisible({ timeout: 30_000 });
  return loc;
}

/** Prefer network idle only when the route uses a known API prefix. */
export async function waitForApiOk(page: Page, urlPart: string): Promise<void> {
  await page.waitForResponse(
    (res) => res.url().includes(urlPart) && res.ok(),
    { timeout: 30_000 },
  );
}
