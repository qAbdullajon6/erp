import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface InvoicePayment {
  id: string;
  paymentDate: string;
  amount: string;
  currency: string;
  method: string;
  reference: string | null;
  notes: string | null;
}

export interface Invoice {
  id: string;
  organizationId: string;
  invoiceNumber: string;
  customerId: string;
  orderId: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  status: InvoiceStatus;
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
  lineItems?: InvoiceLineItem[];
  payments?: InvoicePayment[];
}

export interface ListInvoicesResponse {
  items: Invoice[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListInvoicesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: InvoiceStatus;
  customerId?: string;
  orderId?: string;
  issueDateFrom?: string;
  issueDateTo?: string;
  sortBy?: 'invoiceNumber' | 'issueDate' | 'dueDate' | 'totalAmount' | 'balanceDue' | 'status' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface InvoiceLineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateInvoiceInput {
  invoiceNumber?: string;
  customerId: string;
  orderId?: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  lineItems: InvoiceLineItemInput[];
  discountAmount?: number;
  taxAmount?: number;
  notes?: string;
}

export interface UpdateInvoiceInput {
  invoiceNumber?: string;
  customerId?: string;
  orderId?: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  lineItems?: InvoiceLineItemInput[];
  discountAmount?: number;
  taxAmount?: number;
  notes?: string;
}

function buildQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function unwrap<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || fallbackMessage);
  }
  const result = await response.json();
  return (result.data ?? result) as T;
}

class InvoicesAPI {
  async list(params: ListInvoicesParams = {}): Promise<ListInvoicesResponse> {
    const response = await apiFetch(`/api/invoices${buildQuery(params)}`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch invoices');
  }

  async getById(id: string): Promise<Invoice> {
    const response = await apiFetch(`/api/invoices/${id}`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch invoice');
  }

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    const response = await apiFetch('/api/invoices', { method: 'POST', body: JSON.stringify(input) });
    return unwrap(response, 'Failed to create invoice');
  }

  async createFromOrder(orderId: string): Promise<Invoice> {
    const response = await apiFetch(`/api/invoices/from-order/${orderId}`, { method: 'POST' });
    return unwrap(response, 'Failed to create invoice from order');
  }

  async update(id: string, input: UpdateInvoiceInput): Promise<Invoice> {
    const response = await apiFetch(`/api/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    return unwrap(response, 'Failed to update invoice');
  }

  async send(id: string): Promise<Invoice> {
    const response = await apiFetch(`/api/invoices/${id}/send`, { method: 'POST' });
    return unwrap(response, 'Failed to send invoice');
  }

  async cancel(id: string): Promise<Invoice> {
    const response = await apiFetch(`/api/invoices/${id}/cancel`, { method: 'POST' });
    return unwrap(response, 'Failed to cancel invoice');
  }
}

export const invoicesAPI = new InvoicesAPI();

export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (params: ListInvoicesParams) => [...invoiceKeys.lists(), params] as const,
  details: () => [...invoiceKeys.all, 'detail'] as const,
  detail: (id: string) => [...invoiceKeys.details(), id] as const,
};

export function useInvoicesQuery(params: ListInvoicesParams = {}, enabled: boolean = true) {
  return useQuery({
    queryKey: invoiceKeys.list(params),
    queryFn: () => invoicesAPI.list(params),
    enabled,
  });
}

export function useInvoiceQuery(id: string) {
  return useQuery({
    queryKey: invoiceKeys.detail(id),
    queryFn: () => invoicesAPI.getById(id),
    enabled: !!id,
  });
}

export function useCreateInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) => invoicesAPI.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
  });
}

export function useCreateInvoiceFromOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => invoicesAPI.createFromOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
  });
}

export function useUpdateInvoiceMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateInvoiceInput) => invoicesAPI.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
  });
}

export function useSendInvoiceMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invoicesAPI.send(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
  });
}

export function useCancelInvoiceMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invoicesAPI.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
  });
}
