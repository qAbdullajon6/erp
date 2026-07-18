import { sessionManager, notifySessionExpired } from './session';

export interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

/// Access tokens live for 15 minutes (JWT_ACCESS_EXPIRES_IN_SECONDS). Without
/// this, sitting on a screen past that window meant the next request 401'd, the
/// session was wiped, and the user was bounced to sign-in — even though a
/// perfectly good refresh token was sitting in sessionStorage. On a 401 we
/// spend the refresh token once and replay the original request.
///
/// The in-flight promise is shared: a dashboard paints half a dozen requests at
/// once, and each one refreshing independently would burn through the rotating
/// refresh token (the API invalidates the presented token on use) and log the
/// user out anyway.
let inFlightRefresh: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = sessionManager.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return false;

    const result = await response.json();
    const data = result.data ?? result;
    if (!data?.accessToken || !data?.refreshToken) return false;

    sessionManager.setTokens(data.accessToken, data.refreshToken);
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
  // A FormData body needs the browser's own auto-generated
  // `multipart/form-data; boundary=...` header — callers (delivery-proof
  // photo/signature upload) used to pass `headers: {}` hoping to suppress
  // the default below, but Object.assign onto an object that already has
  // Content-Type set doesn't remove it, so every multipart upload actually
  // went out as `Content-Type: application/json` with a multipart body
  // inside it. The server read that as unparseable JSON and 400'd with "no
  // file provided" — uploads never worked through the real app at all.
  const headers: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' };

  if (customHeaders && typeof customHeaders === 'object' && !Array.isArray(customHeaders)) {
    Object.assign(headers, customHeaders as Record<string, string>);
  }

  if (!skipAuth) {
    const token = sessionManager.getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

export async function apiFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { skipAuth = false, headers: customHeaders, ...restOptions } = options;
  const isFormData = restOptions.body instanceof FormData;

  const response = await fetch(url, {
    ...restOptions,
    headers: buildHeaders(customHeaders, skipAuth, isFormData),
  });

  if (response.status !== 401 || skipAuth) {
    return response;
  }

  // Refreshing a refresh would recurse.
  if (url.includes('/auth/refresh')) {
    sessionManager.clearTokens();
    notifySessionExpired();
    return response;
  }

  const refreshed = await refreshSessionOnce();
  if (!refreshed) {
    sessionManager.clearTokens();
    notifySessionExpired();
    return response;
  }

  // Replay the original request with the newly minted access token.
  return fetch(url, {
    ...restOptions,
    headers: buildHeaders(customHeaders, skipAuth, isFormData),
  });
}
