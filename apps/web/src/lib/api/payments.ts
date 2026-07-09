import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { invoiceKeys, type Invoice } from './invoices';

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'OTHER';

export interface Payment {
  id: string;
  organizationId: string;
  invoiceId: string;
  paymentDate: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ListPaymentsResponse {
  items: Payment[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListPaymentsParams {
  page?: number;
  limit?: number;
  invoiceId?: string;
  method?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'paymentDate' | 'amount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface CreatePaymentInput {
  paymentDate?: string;
  amount: number;
  currency?: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
}

export interface RecordPaymentResult {
  payment: Payment;
  invoice: Invoice;
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

class PaymentsAPI {
  async list(params: ListPaymentsParams = {}): Promise<ListPaymentsResponse> {
    const response = await apiFetch(`/api/payments${buildQuery(params)}`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch payments');
  }

  async listForInvoice(invoiceId: string): Promise<ListPaymentsResponse> {
    const response = await apiFetch(`/api/invoices/${invoiceId}/payments`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch invoice payments');
  }

  async record(invoiceId: string, input: CreatePaymentInput): Promise<RecordPaymentResult> {
    const response = await apiFetch(`/api/invoices/${invoiceId}/payments`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrap(response, 'Failed to record payment');
  }
}

export const paymentsAPI = new PaymentsAPI();

export const paymentKeys = {
  all: ['payments'] as const,
  lists: () => [...paymentKeys.all, 'list'] as const,
  list: (params: ListPaymentsParams) => [...paymentKeys.lists(), params] as const,
  forInvoice: (invoiceId: string) => [...paymentKeys.all, 'invoice', invoiceId] as const,
};

export function usePaymentsQuery(params: ListPaymentsParams = {}) {
  return useQuery({
    queryKey: paymentKeys.list(params),
    queryFn: () => paymentsAPI.list(params),
  });
}

export function useInvoicePaymentsQuery(invoiceId: string) {
  return useQuery({
    queryKey: paymentKeys.forInvoice(invoiceId),
    queryFn: () => paymentsAPI.listForInvoice(invoiceId),
    enabled: !!invoiceId,
  });
}

export function useRecordPaymentMutation(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePaymentInput) => paymentsAPI.record(invoiceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.forInvoice(invoiceId) });
      queryClient.invalidateQueries({ queryKey: paymentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
  });
}
