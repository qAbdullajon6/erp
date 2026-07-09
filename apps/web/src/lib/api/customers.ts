import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from './fetch';

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

interface ApiResponse<T> {
  data: T;
}

class CustomersAPI {
  private baseUrl = '/api';

  async list(params?: ListCustomersParams): Promise<CustomerListResponse> {
    try {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set('page', String(params.page));
      if (params?.limit) searchParams.set('limit', String(params.limit));
      if (params?.search) searchParams.set('search', params.search);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.includeArchived !== undefined) searchParams.set('includeArchived', String(params.includeArchived));
      if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
      if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);

      const url = `${this.baseUrl}/customers${searchParams.toString() ? `?${searchParams}` : ''}`;

      const response = await apiFetch(url, { method: 'GET' });

      if (!response.ok) {
        throw new Error(`Failed to fetch customers: ${response.statusText}`);
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error fetching customers:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<Customer> {
    try {
      const response = await apiFetch(`${this.baseUrl}/customers/${id}`, { method: 'GET' });

      if (!response.ok) {
        throw new Error(`Failed to fetch customer: ${response.statusText}`);
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error fetching customer:', error);
      throw error;
    }
  }

  async create(data: CreateCustomerInput): Promise<Customer> {
    try {
      const response = await apiFetch(`${this.baseUrl}/customers`, {
        method: 'POST',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Failed to create customer' } }));
        throw new Error(error.error?.message || 'Failed to create customer');
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  }

  async update(id: string, data: UpdateCustomerInput): Promise<Customer> {
    try {
      const response = await apiFetch(`${this.baseUrl}/customers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Failed to update customer' } }));
        throw new Error(error.error?.message || 'Failed to update customer');
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  }

  async archive(id: string): Promise<Customer> {
    try {
      const response = await apiFetch(`${this.baseUrl}/customers/${id}/archive`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to archive customer');
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error archiving customer:', error);
      throw error;
    }
  }

  async restore(id: string): Promise<Customer> {
    try {
      const response = await apiFetch(`${this.baseUrl}/customers/${id}/restore`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to restore customer');
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error restoring customer:', error);
      throw error;
    }
  }
}

export const customersAPI = new CustomersAPI();

export function useCustomersList(initialParams?: ListCustomersParams) {
  const [data, setData] = useState<Customer[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number; totalPages: number }>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(
    async (params?: ListCustomersParams) => {
      setLoading(true);
      setError(null);
      try {
        const result = await customersAPI.list(params || initialParams);
        setData(result.items);
        setMeta(result.meta);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load customers');
        setData([]);
      } finally {
        setLoading(false);
      }
    },
    [] // Empty dependency - fetch is stable, params passed explicitly
  );

  // Auto-fetch on mount with initialParams
  useEffect(() => {
    if (initialParams) {
      fetch(initialParams);
    }
  }, [JSON.stringify(initialParams), fetch]);

  return { data, meta, loading, error, refetch: fetch, fetch };
}

export function useCustomerDetail(id: string) {
  const [data, setData] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await customersAPI.getById(id);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  return { data, loading, error, refetch: fetch, fetch };
}

export function useCreateCustomer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateCustomerInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await customersAPI.create(input);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create customer';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
}

export function useUpdateCustomer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(async (id: string, input: UpdateCustomerInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await customersAPI.update(id, input);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update customer';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { update, loading, error };
}

export function useArchiveCustomer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archive = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await customersAPI.archive(id);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive customer';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { archive, loading, error };
}

export function useRestoreCustomer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await customersAPI.restore(id);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore customer';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { restore, loading, error };
}
