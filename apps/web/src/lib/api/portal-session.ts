const TOKEN_STORAGE_KEY = 'flowerp_portal_access_token';
const REFRESH_TOKEN_STORAGE_KEY = 'flowerp_portal_refresh_token';

/// Architecture review fix: see lib/api/session.ts's onSessionExpired for
/// the full rationale — the same mid-session-token-death gap existed here.
type PortalSessionExpiredListener = () => void;
const portalSessionExpiredListeners = new Set<PortalSessionExpiredListener>();

export function onPortalSessionExpired(listener: PortalSessionExpiredListener): () => void {
  portalSessionExpiredListeners.add(listener);
  return () => portalSessionExpiredListeners.delete(listener);
}

export function notifyPortalSessionExpired(): void {
  portalSessionExpiredListeners.forEach((listener) => listener());
}

export const portalSessionManager = {
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
