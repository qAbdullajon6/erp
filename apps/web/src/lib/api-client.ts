// Typed client foundation for the apps/api backend — NOT used anywhere in
// the live demo yet. The demo continues to run entirely on localStorage
// (see mock-data.ts/store.tsx); this module exists so a future phase can
// wire up real auth without inventing the request/response types from
// scratch. Every call is a no-op (throws ApiDisabledError) unless
// NEXT_PUBLIC_ENABLE_API is "true" OR NEXT_PUBLIC_DATA_MODE is "api" — see
// apps/web/.env.example and docs/CUSTOMERS_API.md.

import { getDataMode } from "./data-mode";

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

/// Mirrors apps/api's Customer response shape exactly (see
/// docs/CUSTOMERS_API.md). `creditLimit` is a decimal STRING (e.g.
/// "15000.00"), never a JS number, to avoid floating-point precision loss.
export interface ApiCustomer {
  id: string;
  organizationId: string;
  customerCode: string;
  companyName: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  taxId: string | null;
  paymentTerms: "DUE_ON_RECEIPT" | "NET_15" | "NET_30" | "NET_45";
  creditLimit: string;
  status: "ACTIVE" | "AT_RISK" | "INACTIVE" | "ARCHIVED";
  deliveryNotes: string | null;
  internalNotes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListCustomersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ApiCustomer["status"];
  includeArchived?: boolean;
  sortBy?: "customerCode" | "companyName" | "createdAt" | "updatedAt" | "creditLimit" | "status";
  sortOrder?: "asc" | "desc";
}

export interface ListCustomersResult {
  items: ApiCustomer[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateCustomerInput {
  customerCode?: string;
  companyName: string;
  contactName: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  address?: string;
  taxId?: string;
  paymentTerms?: ApiCustomer["paymentTerms"];
  creditLimit?: number;
  deliveryNotes?: string;
  internalNotes?: string;
}

export type UpdateCustomerInput = Partial<CreateCustomerInput> & {
  status?: "ACTIVE" | "AT_RISK" | "INACTIVE";
};

export function isApiEnabled(): boolean {
  // Either flag is sufficient, so a developer enabling Connected Mode for a
  // module (NEXT_PUBLIC_DATA_MODE=api) doesn't also have to separately flip
  // this more generic switch.
  return process.env.NEXT_PUBLIC_ENABLE_API === "true" || getDataMode() === "api";
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

  listCustomers: (accessToken: string, params: ListCustomersParams = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.search) query.set("search", params.search);
    if (params.status) query.set("status", params.status);
    if (params.includeArchived) query.set("includeArchived", "true");
    if (params.sortBy) query.set("sortBy", params.sortBy);
    if (params.sortOrder) query.set("sortOrder", params.sortOrder);
    const qs = query.toString();
    return request<ListCustomersResult>(`/customers${qs ? `?${qs}` : ""}`, {
      headers: authHeader(accessToken),
    });
  },

  getCustomer: (accessToken: string, id: string) =>
    request<ApiCustomer>(`/customers/${id}`, { headers: authHeader(accessToken) }),

  createCustomer: (accessToken: string, input: CreateCustomerInput) =>
    request<ApiCustomer>("/customers", {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  updateCustomer: (accessToken: string, id: string, input: UpdateCustomerInput) =>
    request<ApiCustomer>(`/customers/${id}`, {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  archiveCustomer: (accessToken: string, id: string) =>
    request<ApiCustomer>(`/customers/${id}/archive`, {
      method: "POST",
      headers: authHeader(accessToken),
    }),

  restoreCustomer: (accessToken: string, id: string) =>
    request<ApiCustomer>(`/customers/${id}/restore`, {
      method: "POST",
      headers: authHeader(accessToken),
    }),
};
