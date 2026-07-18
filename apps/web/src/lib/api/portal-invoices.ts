import { useQuery } from '@tanstack/react-query';
import { portalFetch } from './portal-fetch';
import { unwrapResponse as unwrap } from './error';
import { portalInvoiceKeys } from './portal-query-keys';
import { describeError } from './describe-error';

export type PortalInvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface PortalInvoiceLineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface PortalInvoicePayment {
  id: string;
  paymentDate: string;
  amount: string;
  currency: string;
  method: string;
  reference: string | null;
  notes: string | null;
}

export interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  status: PortalInvoiceStatus;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems?: PortalInvoiceLineItem[];
  payments?: PortalInvoicePayment[];
}

export interface ListPortalInvoicesResponse {
  items: PortalInvoice[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListPortalInvoicesQuery {
  page?: number;
  limit?: number;
  status?: PortalInvoiceStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

function buildQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

class PortalInvoicesAPI {
  private baseUrl = '/api/customer-portal/invoices';

  async list(query: ListPortalInvoicesQuery = {}): Promise<ListPortalInvoicesResponse> {
    const response = await portalFetch(`${this.baseUrl}${buildQuery(query)}`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch invoices');
  }

  async getById(id: string): Promise<PortalInvoice> {
    const response = await portalFetch(`${this.baseUrl}/${id}`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch invoice');
  }
}

export const portalInvoicesAPI = new PortalInvoicesAPI();

export function usePortalInvoicesList(query: ListPortalInvoicesQuery = {}) {
  const result = useQuery({
    queryKey: portalInvoiceKeys.list(query),
    queryFn: () => portalInvoicesAPI.list(query),
  });

  return {
    data: result.data?.items ?? [],
    meta: result.data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load invoices') : null,
    refetch: result.refetch,
  };
}

export function usePortalInvoice(id: string) {
  const result = useQuery({
    queryKey: portalInvoiceKeys.detail(id),
    queryFn: () => portalInvoicesAPI.getById(id),
    enabled: Boolean(id),
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load invoice') : null,
    refetch: result.refetch,
  };
}
