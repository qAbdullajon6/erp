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

export type ApiMembershipRole =
  | "ADMIN"
  | "OPERATIONS_MANAGER"
  | "DISPATCHER"
  | "ACCOUNTANT"
  | "DRIVER"
  | "SALES_CRM_MANAGER";

export interface ApiMembership {
  id: string;
  role: ApiMembershipRole;
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

/// Mirrors GET /organizations/current — a superset of the lighter
/// ApiOrganization embedded in AuthResult/MeResult (adds `status`).
export interface ApiOrganizationDetail {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  defaultCurrency: string;
  timezone: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  defaultCurrency?: string;
  timezone?: string;
}

export interface ApiMember {
  id: string;
  role: ApiMembershipRole;
  status: "ACTIVE" | "INVITED" | "REMOVED";
  createdAt: string;
  user: { id: string; email: string; firstName: string; lastName: string };
}

export interface AddMemberInput {
  email: string;
  role: ApiMembershipRole;
}

export interface UpdateMemberInput {
  role?: ApiMembershipRole;
  status?: "ACTIVE" | "INVITED" | "REMOVED";
}

export type ApiOrderStatus =
  | "DRAFT"
  | "PENDING"
  | "ASSIGNED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED";

export interface ApiOrderStatusHistoryEntry {
  id: string;
  status: ApiOrderStatus;
  changedByUserId: string | null;
  note: string | null;
  createdAt: string;
}

/// Mirrors apps/api's Order response shape exactly (see
/// docs/ORDERS_DISPATCH_API.md). `price`/`cargoWeightKg`/`cargoVolumeM3` are
/// decimal STRINGS (never JS numbers), same rationale as
/// ApiCustomer.creditLimit. `isDelayed` is computed server-side, never
/// stored. `statusHistory` is only present on GET /orders/:id, not on list
/// items.
export interface ApiOrder {
  id: string;
  organizationId: string;
  orderNumber: string;
  customerId: string;
  pickupAddress: string;
  pickupCity: string;
  pickupDate: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDate: string;
  cargoDescription: string;
  cargoWeightKg: string | null;
  cargoVolumeM3: string | null;
  price: string;
  currency: string;
  status: ApiOrderStatus;
  isDelayed: boolean;
  driverId: string | null;
  vehicleId: string | null;
  notes: string | null;
  deliveryNotes: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  deliveredAt: string | null;
  statusHistory?: ApiOrderStatusHistoryEntry[];
}

export interface ListOrdersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ApiOrderStatus;
  customerId?: string;
  driverId?: string;
  vehicleId?: string;
  sortBy?: "orderNumber" | "pickupDate" | "deliveryDate" | "price" | "status" | "createdAt";
  sortOrder?: "asc" | "desc";
}

export interface ListOrdersResult {
  items: ApiOrder[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateOrderInput {
  orderNumber?: string;
  customerId: string;
  pickupAddress: string;
  pickupCity: string;
  pickupDate: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDate: string;
  cargoDescription: string;
  cargoWeightKg?: number;
  cargoVolumeM3?: number;
  price: number;
  currency?: string;
  notes?: string;
  deliveryNotes?: string;
}

export type UpdateOrderInput = Partial<CreateOrderInput>;

export interface AssignOrderInput {
  driverId: string;
  vehicleId: string;
}

export interface UpdateOrderStatusInput {
  status: ApiOrderStatus;
  note?: string;
}

export interface CancelOrderInput {
  note?: string;
}

/// Lightweight summaries — the shape apps/api's DispatchService actually
/// returns, distinct from (and lighter than) the full Driver/Vehicle
/// records apps/api also exposes at GET /drivers and /vehicles. Connected
/// Mode has no Drivers/Vehicles UI yet (see docs/ORDERS_DISPATCH_API.md),
/// only this read-only Dispatch Board view.
export interface DispatchDriverSummary {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: string;
}

export interface DispatchVehicleSummary {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  type: string;
  capacityKg: string | null;
  capacityM3: string | null;
  status: string;
}

export interface DispatchOrderSummary {
  id: string;
  orderNumber: string;
  pickupCity: string;
  deliveryCity: string;
  pickupDate: string;
  deliveryDate: string;
  status: ApiOrderStatus;
}

export interface DispatchBoardResult {
  unassignedOrders: DispatchOrderSummary[];
  drivers: {
    available: DispatchDriverSummary[];
    busy: { driver: DispatchDriverSummary; currentOrder: DispatchOrderSummary }[];
    onLeave: DispatchDriverSummary[];
    inactive: DispatchDriverSummary[];
  };
  vehicles: {
    available: DispatchVehicleSummary[];
    busy: { vehicle: DispatchVehicleSummary; currentOrder: DispatchOrderSummary }[];
    inUse: DispatchVehicleSummary[];
    maintenance: DispatchVehicleSummary[];
    inactive: DispatchVehicleSummary[];
  };
}

export interface DispatchAvailabilityResult {
  drivers: DispatchDriverSummary[];
  vehicles: DispatchVehicleSummary[];
}

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

/// Carries the HTTP status code so callers (see api-session.ts's callApi)
/// can tell a 401 (access token expired — worth a silent refresh-and-retry)
/// apart from any other failure (validation error, 403, network problem).
export class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isApiEnabled()) {
    throw new ApiDisabledError();
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error(
      `Could not reach the API at ${getApiBaseUrl()}. Is apps/api running?`,
    );
  }

  const body = (await response.json()) as ApiSuccessEnvelope<T> | ApiErrorEnvelope;

  if (!response.ok || "error" in body) {
    const message =
      "error" in body ? body.error.message : `Request failed with status ${response.status}`;
    throw new ApiRequestError(response.status, message);
  }

  return body.data;
}

function authHeader(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/// Inactive by default — see isApiEnabled(). Used by the Connected Mode
/// Customers view, the /auth/* pages, and /settings/* pages, all gated so
/// none of them run in demo mode.
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

  getCurrentOrganization: (accessToken: string) =>
    request<ApiOrganizationDetail>("/organizations/current", { headers: authHeader(accessToken) }),

  updateOrganization: (accessToken: string, input: UpdateOrganizationInput) =>
    request<ApiOrganizationDetail>("/organizations/current", {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  listMembers: (accessToken: string) =>
    request<ApiMember[]>("/organizations/current/members", { headers: authHeader(accessToken) }),

  addMember: (accessToken: string, input: AddMemberInput) =>
    request<ApiMember>("/organizations/current/members", {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  updateMember: (accessToken: string, membershipId: string, input: UpdateMemberInput) =>
    request<ApiMember>(`/organizations/current/members/${membershipId}`, {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  removeMember: (accessToken: string, membershipId: string) =>
    request<{ id: string; status: string }>(`/organizations/current/members/${membershipId}`, {
      method: "DELETE",
      headers: authHeader(accessToken),
    }),

  listOrders: (accessToken: string, params: ListOrdersParams = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.search) query.set("search", params.search);
    if (params.status) query.set("status", params.status);
    if (params.customerId) query.set("customerId", params.customerId);
    if (params.driverId) query.set("driverId", params.driverId);
    if (params.vehicleId) query.set("vehicleId", params.vehicleId);
    if (params.sortBy) query.set("sortBy", params.sortBy);
    if (params.sortOrder) query.set("sortOrder", params.sortOrder);
    const qs = query.toString();
    return request<ListOrdersResult>(`/orders${qs ? `?${qs}` : ""}`, {
      headers: authHeader(accessToken),
    });
  },

  getOrder: (accessToken: string, id: string) =>
    request<ApiOrder>(`/orders/${id}`, { headers: authHeader(accessToken) }),

  createOrder: (accessToken: string, input: CreateOrderInput) =>
    request<ApiOrder>("/orders", {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  updateOrder: (accessToken: string, id: string, input: UpdateOrderInput) =>
    request<ApiOrder>(`/orders/${id}`, {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  assignOrder: (accessToken: string, id: string, input: AssignOrderInput) =>
    request<ApiOrder>(`/orders/${id}/assign`, {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  updateOrderStatus: (accessToken: string, id: string, input: UpdateOrderStatusInput) =>
    request<ApiOrder>(`/orders/${id}/status`, {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  cancelOrder: (accessToken: string, id: string, input: CancelOrderInput = {}) =>
    request<ApiOrder>(`/orders/${id}/cancel`, {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  dispatchBoard: (accessToken: string) =>
    request<DispatchBoardResult>("/dispatch/board", { headers: authHeader(accessToken) }),

  dispatchAvailability: (accessToken: string, params: { pickupDate?: string; deliveryDate?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.pickupDate) query.set("pickupDate", params.pickupDate);
    if (params.deliveryDate) query.set("deliveryDate", params.deliveryDate);
    const qs = query.toString();
    return request<DispatchAvailabilityResult>(`/dispatch/availability${qs ? `?${qs}` : ""}`, {
      headers: authHeader(accessToken),
    });
  },
};
