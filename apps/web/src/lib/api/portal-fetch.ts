import { portalSessionManager, notifyPortalSessionExpired } from './portal-session';

export interface PortalFetchOptions extends RequestInit {
  skipAuth?: boolean;
}

let inFlightRefresh: Promise<boolean> | null = null;

async function refreshPortalSession(): Promise<boolean> {
  const refreshToken = portalSessionManager.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch('/api/customer-portal/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return false;

    const result = await response.json();
    const data = result.data ?? result;
    if (!data?.accessToken || !data?.refreshToken) return false;

    portalSessionManager.setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function refreshPortalSessionOnce(): Promise<boolean> {
  if (!inFlightRefresh) {
    inFlightRefresh = refreshPortalSession().finally(() => {
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
  // See lib/api/fetch.ts's apiFetch for why this matters: a FormData body
  // needs the browser's own multipart boundary header, and a hardcoded
  // Content-Type: application/json here would silently corrupt it. No
  // portal call site sends FormData today, but this mirrors apiFetch so the
  // same bug can't reappear the first time one does.
  const headers: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' };

  if (customHeaders && typeof customHeaders === 'object' && !Array.isArray(customHeaders)) {
    Object.assign(headers, customHeaders as Record<string, string>);
  }

  if (!skipAuth) {
    const token = portalSessionManager.getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

export async function portalFetch(url: string, options: PortalFetchOptions = {}): Promise<Response> {
  const { skipAuth = false, headers: customHeaders, ...restOptions } = options;
  const isFormData = restOptions.body instanceof FormData;

  const response = await fetch(url, {
    ...restOptions,
    headers: buildHeaders(customHeaders, skipAuth, isFormData),
  });

  if (response.status !== 401 || skipAuth) {
    return response;
  }

  if (url.includes('/auth/refresh')) {
    portalSessionManager.clearTokens();
    notifyPortalSessionExpired();
    return response;
  }

  const refreshed = await refreshPortalSessionOnce();
  if (!refreshed) {
    portalSessionManager.clearTokens();
    notifyPortalSessionExpired();
    return response;
  }

  return fetch(url, {
    ...restOptions,
    headers: buildHeaders(customHeaders, skipAuth, isFormData),
  });
}
