import { sessionManager } from './auth';

export interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiFetch(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { skipAuth = false, headers: customHeaders, ...restOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Merge custom headers
  if (customHeaders) {
    if (typeof customHeaders === 'object' && !Array.isArray(customHeaders)) {
      Object.assign(headers, customHeaders as Record<string, string>);
    }
  }

  // Add authorization header if token exists and not skipped
  if (!skipAuth) {
    const token = sessionManager.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    ...restOptions,
    headers,
  });

  // If 401, clear session and let the app redirect to login
  if (response.status === 401) {
    sessionManager.clearTokens();
  }

  return response;
}
