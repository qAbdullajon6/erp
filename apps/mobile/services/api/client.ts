import { API_URL } from '@/constants/config';
import { authStore, useAuthStore } from '@/store/auth-store';
import { useNetworkStore } from '@/store/network-store';

export interface RequestOptions extends RequestInit {
  /** Skip attaching the bearer token — only /auth/login, /auth/register, and
   * /auth/refresh itself need this. */
  skipAuth?: boolean;
}

/** A request that neither succeeds nor fails within this window is almost
 * certainly talking to a server that's down, not one that's merely slow — 30s
 * matches apps/api's own REQUEST_TIMEOUT_MS default, so a legitimately slow
 * report query on the backend has time to finish before the phone gives up on
 * it first. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Access tokens live for 15 minutes (ACCESS_TOKEN_LIFETIME_SECONDS, mirroring
 * apps/api's JWT_ACCESS_EXPIRES_IN_SECONDS). A driver who leaves the app foregrounded
 * past that window would otherwise see their next request 401, get logged out, and
 * lose whatever they were mid-typing on a delivery note. On a 401 we spend the
 * refresh token once and replay the original request — same contract as
 * apps/web/src/lib/api/fetch.ts.
 *
 * The in-flight promise is shared: Home and Jobs can both mount on cold start and
 * fire a request at the same moment, and each refreshing independently would burn
 * through the rotating refresh token (the API invalidates the presented token on
 * use) and log the driver out anyway.
 */
let inFlightRefresh: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = authStore.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return false;

    const result = await response.json();
    const data = result.data ?? result;
    if (!data?.accessToken || !data?.refreshToken) return false;

    useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function refreshSessionOnce(): Promise<boolean> {
  if (!inFlightRefresh) {
    inFlightRefresh = refreshSession().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

function buildHeaders(
  customHeaders: HeadersInit | undefined,
  skipAuth: boolean,
  isFormData: boolean,
): Record<string, string> {
  // A FormData body (delivery-proof photo upload, once that endpoint exists) needs
  // the runtime's own auto-generated `multipart/form-data; boundary=...` header.
  // Setting Content-Type here would ship the multipart body under the wrong header
  // and the server would fail to parse it — same bug class fixed on web in
  // apps/web/src/lib/api/fetch.ts.
  const headers: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' };

  if (customHeaders && typeof customHeaders === 'object' && !Array.isArray(customHeaders)) {
    Object.assign(headers, customHeaders as Record<string, string>);
  }

  if (!skipAuth) {
    const token = authStore.getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/** A request that never gets a response — dead wifi, a server that's down, a
 * timeout — throws. This is the one place that happens, so it's the one place
 * that translates it into the network store's vocabulary and a message
 * `describeError` knows how to render, instead of every caller re-deriving
 * "was this a timeout or a drop" from a raw AbortError. */
async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    useNetworkStore.getState().reportSuccess();
    if (response.status >= 500) {
      useNetworkStore.getState().reportFailure('server');
    }
    return response;
  } catch (error) {
    useNetworkStore.getState().reportFailure('network');
    if (error instanceof Error && error.name === 'AbortError') {
      throw new DOMException(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`, 'TimeoutError');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** The one function every endpoint module calls through. `path` is the bare API
 * route (e.g. `/dispatches/my`) — no `/api` prefix, since unlike the web app's Vite
 * dev proxy, the phone talks to the backend's own origin directly (see
 * constants/config.ts). */
export async function apiFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const { skipAuth = false, headers: customHeaders, ...restOptions } = options;
  const isFormData = restOptions.body instanceof FormData;
  const url = `${API_URL}${path}`;

  const response = await fetchWithTimeout(url, {
    ...restOptions,
    headers: buildHeaders(customHeaders, skipAuth, isFormData),
  });

  if (response.status !== 401 || skipAuth) {
    return response;
  }

  // Refreshing a refresh would recurse.
  if (path.includes('/auth/refresh')) {
    useAuthStore.getState().clearSession();
    return response;
  }

  const refreshed = await refreshSessionOnce();
  if (!refreshed) {
    useAuthStore.getState().clearSession();
    return response;
  }

  return fetchWithTimeout(url, {
    ...restOptions,
    headers: buildHeaders(customHeaders, skipAuth, isFormData),
  });
}
