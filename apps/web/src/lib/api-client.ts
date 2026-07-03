// Typed client foundation for the apps/api backend — NOT used anywhere in
// the live demo yet. The demo continues to run entirely on localStorage
// (see mock-data.ts/store.tsx); this module exists so a future phase can
// wire up real auth without inventing the request/response types from
// scratch. Every call is a no-op (throws ApiDisabledError) unless
// NEXT_PUBLIC_ENABLE_API is explicitly "true" — see apps/web/.env.example.

export interface ApiUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface ApiOrganization {
  id: string;
  name: string;
  slug: string;
  defaultCurrency: string;
  timezone: string;
}

export interface ApiMembership {
  id: string;
  role: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  user: ApiUser;
  organization: ApiOrganization;
  membership: ApiMembership;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
}

export interface LoginInput {
  email: string;
  password: string;
  organizationSlug?: string;
}

export interface MeResult {
  user: ApiUser;
  organization: ApiOrganization;
  membership: ApiMembership;
}

export function isApiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_API === "true";
}

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export class ApiDisabledError extends Error {
  constructor() {
    super(
      "The FlowERP AI backend API is disabled in this environment. Set " +
        "NEXT_PUBLIC_ENABLE_API=true to enable it — the live demo runs " +
        "entirely on localStorage and does not require this.",
    );
    this.name = "ApiDisabledError";
  }
}

interface ApiSuccessEnvelope<T> {
  data: T;
}

interface ApiErrorEnvelope {
  error: { statusCode: number; message: string; details?: unknown };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isApiEnabled()) {
    throw new ApiDisabledError();
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  const body = (await response.json()) as ApiSuccessEnvelope<T> | ApiErrorEnvelope;

  if (!response.ok || "error" in body) {
    const message =
      "error" in body ? body.error.message : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body.data;
}

function authHeader(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/// Inactive by default — see isApiEnabled(). Not imported by any page or
/// component in this phase.
export const apiClient = {
  register: (input: RegisterInput) =>
    request<AuthResult>("/auth/register", { method: "POST", body: JSON.stringify(input) }),

  login: (input: LoginInput) =>
    request<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify(input) }),

  refresh: (refreshToken: string) =>
    request<AuthResult>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),

  logout: (accessToken: string, refreshToken: string) =>
    request<{ success: boolean }>("/auth/logout", {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify({ refreshToken }),
    }),

  logoutAll: (accessToken: string) =>
    request<{ revokedCount: number }>("/auth/logout-all", {
      method: "POST",
      headers: authHeader(accessToken),
    }),

  me: (accessToken: string) =>
    request<MeResult>("/auth/me", { headers: authHeader(accessToken) }),

  changePassword: (accessToken: string, currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>("/auth/change-password", {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};
