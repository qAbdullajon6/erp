import { useState, useCallback } from 'react';

const TOKEN_STORAGE_KEY = 'flowerp_access_token';
const REFRESH_TOKEN_STORAGE_KEY = 'flowerp_refresh_token';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  membership: {
    id: string;
    role: string;
  };
}

export interface CurrentUser {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  membership: {
    id: string;
    role: string;
  };
}

// Session management - uses sessionStorage exclusively
// Tokens must be set via setTokens() after successful login or via addInitScript in tests
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

class AuthAPI {
  private baseUrl = '/api';

  private getAuthHeader(): HeadersInit {
    const token = sessionManager.getAccessToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Login failed');
      }

      const result = await response.json();
      const authData = result.data;

      // Store tokens for subsequent requests
      sessionManager.setTokens(authData.accessToken, authData.refreshToken);

      return authData;
    } catch (error) {
      console.error('Error logging in:', error);
      throw error;
    }
  }

  async getCurrentUser(): Promise<CurrentUser> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/me`, {
        method: 'GET',
        headers: this.getAuthHeader(),
      });

      if (!response.ok) {
        if (response.status === 401) {
          sessionManager.clearTokens();
        }
        throw new Error(`Failed to fetch current user: ${response.statusText}`);
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error fetching current user:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/auth/logout`, {
        method: 'POST',
        headers: this.getAuthHeader(),
      });
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      sessionManager.clearTokens();
    }
  }
}

export const authAPI = new AuthAPI();

export function useLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authAPI.login(credentials);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to login';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { login, loading, error };
}

export function useCurrentUser() {
  const [data, setData] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await authAPI.getCurrentUser();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, refetch: fetch, fetch };
}

export function useLogout() {
  const logout = useCallback(async () => {
    await authAPI.logout();
  }, []);

  return { logout };
}
