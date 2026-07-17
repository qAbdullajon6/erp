const TOKEN_STORAGE_KEY = 'flowerp_access_token';
const REFRESH_TOKEN_STORAGE_KEY = 'flowerp_refresh_token';

/// Architecture review fix: fetch.ts's refresh-on-401 logic cleared tokens
/// on a failed refresh but nothing ever redirected — AppShell's session
/// check runs once on mount and never again, so a session that died
/// mid-visit (refresh token expired/revoked) left every subsequent request
/// silently 401ing forever, with the user stuck on a broken screen until a
/// manual reload. This is a separate signal from a deliberate logout
/// (authAPI.logout(), which already navigates explicitly) — only fetch.ts's
/// involuntary-expiry path fires it.
type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

export function notifySessionExpired(): void {
  sessionExpiredListeners.forEach((listener) => listener());
}

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
