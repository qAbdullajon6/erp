import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError } from './describe-error';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';
import { customerKeys } from './query-keys';

// Types matching backend contract exactly
export type CustomerStatus = 'ACTIVE' | 'AT_RISK' | 'INACTIVE' | 'ARCHIVED';
export type CustomerPaymentTerms = 'DUE_ON_RECEIPT' | 'NET_15' | 'NET_30' | 'NET_45';
export type CustomerSortField = 'customerCode' | 'companyName' | 'createdAt' | 'updatedAt' | 'creditLimit' | 'status';

export interface Customer {
  id: string;
  organizationId: string;
  customerCode: string;
  companyName: string;
  contactName: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  taxId?: string | null;
  paymentTerms: CustomerPaymentTerms;
  creditLimit: string; // Decimal as string from API (e.g. "25000.00")
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
  contactName: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  address?: string;
  taxId?: string;
  paymentTerms?: CustomerPaymentTerms;
  creditLimit?: number;
  deliveryNotes?: string;
  internalNotes?: string;
}

export interface UpdateCustomerInput {
  customerCode?: string;
  companyName?: string;
  contactName?: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  taxId?: string | null;
  paymentTerms?: CustomerPaymentTerms;
  creditLimit?: number;
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
