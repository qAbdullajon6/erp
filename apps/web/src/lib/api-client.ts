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

export type ApiInvoiceStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
export type ApiPaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";
export type ApiExpenseCategory =
  | "FUEL"
  | "TOLL"
  | "MAINTENANCE"
  | "DRIVER_ADVANCE"
  | "PARKING"
  | "INSURANCE"
  | "OTHER";
export type ApiExpenseStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ApiInvoiceLineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface ApiInvoicePaymentSummary {
  id: string;
  paymentDate: string;
  amount: string;
  currency: string;
  method: ApiPaymentMethod;
  reference: string | null;
  notes: string | null;
}

/// Mirrors apps/api's Invoice response shape (see docs/FINANCE_API.md). All
/// monetary fields are decimal STRINGS, never JS numbers — same rationale
/// as ApiCustomer.creditLimit/ApiOrder.price. `lineItems`/`payments` are
/// only present on GET /invoices/:id, not on list items.
export interface ApiInvoice {
  id: string;
  organizationId: string;
  invoiceNumber: string;
  customerId: string;
  orderId: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  status: ApiInvoiceStatus;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  lineItems?: ApiInvoiceLineItem[];
  payments?: ApiInvoicePaymentSummary[];
}

export interface ListInvoicesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ApiInvoiceStatus;
  customerId?: string;
  orderId?: string;
  sortBy?: "invoiceNumber" | "issueDate" | "dueDate" | "totalAmount" | "balanceDue" | "status" | "createdAt";
  sortOrder?: "asc" | "desc";
}

export interface ListInvoicesResult {
  items: ApiInvoice[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateInvoiceInput {
  invoiceNumber?: string;
  customerId: string;
  orderId?: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  discountAmount?: number;
  taxAmount?: number;
  notes?: string;
}

export type UpdateInvoiceInput = Partial<CreateInvoiceInput>;

export interface ApiPayment {
  id: string;
  organizationId: string;
  invoiceId: string;
  paymentDate: string;
  amount: string;
  currency: string;
  method: ApiPaymentMethod;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ListPaymentsParams {
  page?: number;
  limit?: number;
  invoiceId?: string;
  method?: ApiPaymentMethod;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "paymentDate" | "amount" | "createdAt";
  sortOrder?: "asc" | "desc";
}

export interface ListPaymentsResult {
  items: ApiPayment[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreatePaymentInput {
  paymentDate?: string;
  amount: number;
  currency?: string;
  method: ApiPaymentMethod;
  reference?: string;
  notes?: string;
}

export interface RecordPaymentResult {
  payment: ApiPayment;
  invoice: ApiInvoice;
}

export interface ApiExpense {
  id: string;
  organizationId: string;
  orderId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  expenseNumber: string;
  expenseDate: string;
  category: ApiExpenseCategory;
  description: string;
  amount: string;
  currency: string;
  status: ApiExpenseStatus;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListExpensesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ApiExpenseStatus;
  category?: ApiExpenseCategory;
  orderId?: string;
  vehicleId?: string;
  driverId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "expenseNumber" | "expenseDate" | "amount" | "status" | "createdAt";
  sortOrder?: "asc" | "desc";
}

export interface ListExpensesResult {
  items: ApiExpense[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateExpenseInput {
  expenseNumber?: string;
  orderId?: string;
  vehicleId?: string;
  driverId?: string;
  expenseDate?: string;
  category: ApiExpenseCategory;
  description: string;
  amount: number;
  currency?: string;
  notes?: string;
}

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

export interface FinanceSummaryResult {
  invoices: {
    count: number;
    totalInvoiced: string;
    totalCollected: string;
    totalOutstanding: string;
    overdueCount: number;
    overdueAmount: string;
  };
  expenses: {
    pendingCount: number;
    approvedTotal: string;
  };
  estimatedGrossProfit: string;
}

export interface OrderProfitabilityResult {
  orderId: string;
  orderNumber: string;
  currency: string;
  revenue: string;
  approvedExpenses: string;
  estimatedGrossProfit: string;
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

  listInvoices: (accessToken: string, params: ListInvoicesParams = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.search) query.set("search", params.search);
    if (params.status) query.set("status", params.status);
    if (params.customerId) query.set("customerId", params.customerId);
    if (params.orderId) query.set("orderId", params.orderId);
    if (params.sortBy) query.set("sortBy", params.sortBy);
    if (params.sortOrder) query.set("sortOrder", params.sortOrder);
    const qs = query.toString();
    return request<ListInvoicesResult>(`/invoices${qs ? `?${qs}` : ""}`, {
      headers: authHeader(accessToken),
    });
  },

  getInvoice: (accessToken: string, id: string) =>
    request<ApiInvoice>(`/invoices/${id}`, { headers: authHeader(accessToken) }),

  createInvoice: (accessToken: string, input: CreateInvoiceInput) =>
    request<ApiInvoice>("/invoices", {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  createInvoiceFromOrder: (accessToken: string, orderId: string) =>
    request<ApiInvoice>(`/invoices/from-order/${orderId}`, {
      method: "POST",
      headers: authHeader(accessToken),
    }),

  updateInvoice: (accessToken: string, id: string, input: UpdateInvoiceInput) =>
    request<ApiInvoice>(`/invoices/${id}`, {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  sendInvoice: (accessToken: string, id: string) =>
    request<ApiInvoice>(`/invoices/${id}/send`, { method: "POST", headers: authHeader(accessToken) }),

  cancelInvoice: (accessToken: string, id: string) =>
    request<ApiInvoice>(`/invoices/${id}/cancel`, { method: "POST", headers: authHeader(accessToken) }),

  listPayments: (accessToken: string, params: ListPaymentsParams = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.invoiceId) query.set("invoiceId", params.invoiceId);
    if (params.method) query.set("method", params.method);
    if (params.dateFrom) query.set("dateFrom", params.dateFrom);
    if (params.dateTo) query.set("dateTo", params.dateTo);
    if (params.sortBy) query.set("sortBy", params.sortBy);
    if (params.sortOrder) query.set("sortOrder", params.sortOrder);
    const qs = query.toString();
    return request<ListPaymentsResult>(`/payments${qs ? `?${qs}` : ""}`, {
      headers: authHeader(accessToken),
    });
  },

  listPaymentsForInvoice: (accessToken: string, invoiceId: string) =>
    request<ListPaymentsResult>(`/invoices/${invoiceId}/payments`, { headers: authHeader(accessToken) }),

  recordPayment: (accessToken: string, invoiceId: string, input: CreatePaymentInput) =>
    request<RecordPaymentResult>(`/invoices/${invoiceId}/payments`, {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  listExpenses: (accessToken: string, params: ListExpensesParams = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.search) query.set("search", params.search);
    if (params.status) query.set("status", params.status);
    if (params.category) query.set("category", params.category);
    if (params.orderId) query.set("orderId", params.orderId);
    if (params.vehicleId) query.set("vehicleId", params.vehicleId);
    if (params.driverId) query.set("driverId", params.driverId);
    if (params.dateFrom) query.set("dateFrom", params.dateFrom);
    if (params.dateTo) query.set("dateTo", params.dateTo);
    if (params.sortBy) query.set("sortBy", params.sortBy);
    if (params.sortOrder) query.set("sortOrder", params.sortOrder);
    const qs = query.toString();
    return request<ListExpensesResult>(`/expenses${qs ? `?${qs}` : ""}`, {
      headers: authHeader(accessToken),
    });
  },

  getExpense: (accessToken: string, id: string) =>
    request<ApiExpense>(`/expenses/${id}`, { headers: authHeader(accessToken) }),

  createExpense: (accessToken: string, input: CreateExpenseInput) =>
    request<ApiExpense>("/expenses", {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  updateExpense: (accessToken: string, id: string, input: UpdateExpenseInput) =>
    request<ApiExpense>(`/expenses/${id}`, {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    }),

  approveExpense: (accessToken: string, id: string) =>
    request<ApiExpense>(`/expenses/${id}/approve`, { method: "POST", headers: authHeader(accessToken) }),

  rejectExpense: (accessToken: string, id: string, rejectionReason?: string) =>
    request<ApiExpense>(`/expenses/${id}/reject`, {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify({ rejectionReason }),
    }),

  financeSummary: (accessToken: string) =>
    request<FinanceSummaryResult>("/finance/summary", { headers: authHeader(accessToken) }),

  orderProfitability: (accessToken: string, orderId: string) =>
    request<OrderProfitabilityResult>(`/finance/order-profitability/${orderId}`, {
      headers: authHeader(accessToken),
    }),
};
