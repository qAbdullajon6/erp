import type { Page } from '@playwright/test';
import * as path from 'path';

/** Capture a named screenshot under test-results/enterprise/. */
export async function captureScreenshot(page: Page, name: string): Promise<void> {
  const file = path.join('test-results', 'enterprise', `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
}
