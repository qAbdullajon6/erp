import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError } from './describe-error';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';
import { customerKeys } from './query-keys';

// Types matching backend contract exactly
export type CustomerStatus = 'ACTIVE' | 'AT_RISK' | 'INACTIVE' | 'ARCHIVED';
export type CustomerPaymentTerms =
  | 'DUE_ON_RECEIPT'
  | 'NET_7'
  | 'NET_15'
  | 'NET_30'
  | 'NET_45'
  | 'NET_60'
  | 'NET_90'
  | 'CUSTOM';
export type CustomerSortField = 'customerCode' | 'companyName' | 'createdAt' | 'updatedAt' | 'creditLimit' | 'status';

/**
 * Returns "Unlimited" for null, "No credit" for 0, or null for positive values
 * (caller should format the amount with their currency context).
 * Used in Customer detail, list, and portal.
 */
export function creditLimitLabel(
  creditLimit: string | null | undefined,
): 'Unlimited' | 'No credit' | null {
  if (creditLimit == null) return 'Unlimited';
  const n = parseFloat(creditLimit as string);
  if (!Number.isFinite(n)) return 'Unlimited';
  if (n === 0) return 'No credit';
  return null; // positive — caller formats with currency
}

/**
 * Human-readable label for a payment terms value.
 * Used in Customer create/edit forms, detail view, list, and customer portal.
 */
export function formatPaymentTerms(
  terms: string | null | undefined,
  days?: number | null,
): string {
  switch (terms) {
    case 'DUE_ON_RECEIPT': return 'Due on receipt';
    case 'NET_7':  return 'Net 7 days';
    case 'NET_15': return 'Net 15 days';
    case 'NET_30': return 'Net 30 days';
    case 'NET_45': return 'Net 45 days';
    case 'NET_60': return 'Net 60 days';
    case 'NET_90': return 'Net 90 days';
    case 'CUSTOM': return days != null ? `Custom — ${days} days` : 'Custom';
    default: return terms ?? '—';
  }
}

export interface Customer {
  id: string;
  organizationId: string;
  customerCode: string;
  companyName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  lat?: number | null; // WGS-84 — set when city was selected from a Mapbox suggestion
  lng?: number | null;
  address?: string | null;
  postalCode?: string | null;
  taxId?: string | null;
  paymentTerms: CustomerPaymentTerms;
  /** Only present when paymentTerms = CUSTOM. Integer ≥ 0. */
  paymentTermsDays?: number | null;
  creditLimit: string | null; // Decimal as string (e.g. "25000.00"); null = no credit limit
  currency?: string | null; // ISO 4217 — null means use org defaultCurrency
  status: CustomerStatus;
  deliveryNotes?: string | null;
  internalNotes?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListResponse {
  items: Customer[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListCustomersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: CustomerStatus;
  includeArchived?: boolean;
  sortBy?: CustomerSortField;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateCustomerInput {
  customerCode?: string;
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  cityLat?: number; // from Mapbox suggestion; omit for free-text city
  cityLng?: number;
  address?: string;
  postalCode?: string;
  taxId?: string;
  paymentTerms?: CustomerPaymentTerms;
  /** Required when paymentTerms = CUSTOM; ignored for preset terms. */
  paymentTermsDays?: number | null;
  /** null = no credit limit; 0 = $0 credit; positive = credit cap */
  creditLimit?: number | null;
  currency?: string;
  deliveryNotes?: string;
  internalNotes?: string;
}

export interface UpdateCustomerInput {
  customerCode?: string;
  companyName?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  cityLat?: number | null; // null clears stored coordinates
  cityLng?: number | null;
  address?: string | null;
  postalCode?: string | null;
  taxId?: string | null;
  paymentTerms?: CustomerPaymentTerms;
  /** Required when paymentTerms = CUSTOM; null clears it (sent when switching away from CUSTOM). */
  paymentTermsDays?: number | null;
  /** null = no credit limit; 0 = $0 credit; positive = credit cap */
  creditLimit?: number | null;
  currency?: string | null;
  status?: Exclude<CustomerStatus, 'ARCHIVED'>;
  deliveryNotes?: string | null;
  internalNotes?: string | null;
}

class CustomersAPI {
  private baseUrl = '/api';

  async list(params: ListCustomersParams = {}): Promise<CustomerListResponse> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.search) searchParams.set('search', params.search);
    if (params.status) searchParams.set('status', params.status);
    if (params.includeArchived !== undefined) searchParams.set('includeArchived', String(params.includeArchived));
    if (params.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

    const url = `${this.baseUrl}/customers${searchParams.toString() ? `?${searchParams}` : ''}`;
    const response = await apiFetch(url, { method: 'GET' });
    return unwrapResponse(response, 'Failed to fetch customers');
  }

  async getById(id: string): Promise<Customer> {
    const response = await apiFetch(`${this.baseUrl}/customers/${id}`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to fetch customer');
  }

  async create(data: CreateCustomerInput): Promise<Customer> {
    const response = await apiFetch(`${this.baseUrl}/customers`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return unwrapResponse(response, 'Failed to create customer');
  }

  async update(id: string, data: UpdateCustomerInput): Promise<Customer> {
    const response = await apiFetch(`${this.baseUrl}/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return unwrapResponse(response, 'Failed to update customer');
  }

  async archive(id: string): Promise<Customer> {
    const response = await apiFetch(`${this.baseUrl}/customers/${id}/archive`, {
      method: 'POST',
    });
    return unwrapResponse(response, 'Failed to archive customer');
  }

  async restore(id: string): Promise<Customer> {
    const response = await apiFetch(`${this.baseUrl}/customers/${id}/restore`, {
      method: 'POST',
    });
    return unwrapResponse(response, 'Failed to restore customer');
  }
}

export const customersAPI = new CustomersAPI();

/// Hooks — React Query, matching the Orders module's architecture (Task 8.9)
/// so Customers is on the same standard: one cache shared by the list,
/// detail, and create screens, automatic refetch-on-param-change instead of
/// a manual effect, and no mutation reaching into a neighbour's state —
/// every write invalidates `customerKeys` and whichever screen is mounted
/// re-reads it.

export function useCustomersList(params: ListCustomersParams = {}, options: { enabled?: boolean } = {}) {
  const result = useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => customersAPI.list(params),
    enabled: options.enabled ?? true,
  });

  return {
    data: result.data?.items ?? [],
    meta: result.data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load customers') : null,
    refetch: result.refetch,
  };
}

export function useCustomerDetail(id: string) {
  const result = useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => customersAPI.getById(id),
    enabled: Boolean(id),
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load customer') : null,
    refetch: result.refetch,
  };
}

function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: customerKeys.all });
}

export function useCreateCustomer() {
  const invalidate = useInvalidateCustomers();
  const mutation = useMutation({
    mutationFn: (input: CreateCustomerInput) => customersAPI.create(input),
    onSuccess: invalidate,
  });

  return {
    create: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to create customer') : null,
  };
}

export function useUpdateCustomer() {
  const invalidate = useInvalidateCustomers();
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomerInput }) =>
      customersAPI.update(id, input),
    onSuccess: invalidate,
  });

  return {
    update: (id: string, input: UpdateCustomerInput) => mutation.mutateAsync({ id, input }),
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to update customer') : null,
  };
}

export function useArchiveCustomer() {
  const invalidate = useInvalidateCustomers();
  const mutation = useMutation({
    mutationFn: (id: string) => customersAPI.archive(id),
    onSuccess: invalidate,
  });

  return {
    archive: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to archive customer') : null,
  };
}

export function useRestoreCustomer() {
  const invalidate = useInvalidateCustomers();
  const mutation = useMutation({
    mutationFn: (id: string) => customersAPI.restore(id),
    onSuccess: invalidate,
  });

  return {
    restore: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to restore customer') : null,
  };
}
