import { useQuery } from '@tanstack/react-query';
import { portalFetch } from './portal-fetch';
import { unwrapResponse as unwrap } from './error';
import { portalPaymentKeys } from './portal-query-keys';
import { describeError } from './describe-error';

export interface PortalPaymentItem {
  id: string;
  amount: string;
  currency: string;
  method: string;
  paymentDate: string;
  status: string | null;
  invoiceId: string;
  invoiceNumber: string;
  reference: string | null;
}

export interface PortalPaymentsSummary {
  outstandingBalance: string;
  paidThisMonth: string;
  lastPayment: PortalPaymentItem | null;
  overdueCount: number;
}

class PortalPaymentsAPI {
  private baseUrl = '/api/customer-portal/payments';

  async list(): Promise<{ items: PortalPaymentItem[] }> {
    const response = await portalFetch(this.baseUrl, { method: 'GET' });
    return unwrap(response, 'Failed to fetch payments');
  }

  async summary(): Promise<PortalPaymentsSummary> {
    const response = await portalFetch(`${this.baseUrl}/summary`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch payments summary');
  }
}

export const portalPaymentsAPI = new PortalPaymentsAPI();

export function usePortalPaymentsList(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: portalPaymentKeys.list(),
    queryFn: () => portalPaymentsAPI.list(),
    enabled: options.enabled ?? true,
  });
}

export function usePortalPaymentsSummary() {
  return useQuery({
    queryKey: portalPaymentKeys.summary(),
    queryFn: () => portalPaymentsAPI.summary(),
  });
}

export function usePortalPaymentsListDescribed() {
  const result = usePortalPaymentsList();
  return {
    ...result,
    error: result.error ? describeError(result.error, 'Failed to load payments') : null,
  };
}
