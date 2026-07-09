import { test as baseTest, Page } from '@playwright/test';
import { getTestAuthTokens, SESSION_KEYS } from './auth-helper';

/**
 * Authenticated fixture that injects real test tokens into sessionStorage
 * before the application loads.
 *
 * This ensures the frontend's sessionManager can read the tokens without
 * relying on cookie restoration or fake auth flags.
 */
export const test = baseTest.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    // Acquire real tokens from backend
    const tokens = await getTestAuthTokens();

    // Inject tokens into sessionStorage BEFORE navigating
    // This runs before the application code loads, before route checks
    await page.addInitScript(
      ({ accessTokenKey, refreshTokenKey, accessToken, refreshToken }) => {
        sessionStorage.setItem(accessTokenKey, accessToken);
        if (refreshToken) {
          sessionStorage.setItem(refreshTokenKey, refreshToken);
        }
      },
      {
        accessTokenKey: SESSION_KEYS.ACCESS_TOKEN,
        refreshTokenKey: SESSION_KEYS.REFRESH_TOKEN,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      }
    );

    // Provide the configured page to the test
    await use(page);
  },
});

export { expect } from '@playwright/test';
