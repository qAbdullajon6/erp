const TOKEN_STORAGE_KEY = 'flowerp_access_token';
const REFRESH_TOKEN_STORAGE_KEY = 'flowerp_refresh_token';

/// Tokens live in sessionStorage, not localStorage: a refresh token in
/// localStorage survives tab close and is readable by any injected script.
/// Lives in its own module so `fetch.ts` can read tokens without importing
/// `auth.ts`, which imports `fetch.ts` back.
export const sessionManager = {
  setTokens(accessToken: string, refreshToken: string) {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    sessionStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
  },

  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  },

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  },

  clearTokens() {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  },

  hasValidSession(): boolean {
    return this.getAccessToken() !== null;
  },
};
