import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './fetch';

export interface FinanceSummary {
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

async function unwrap<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || fallbackMessage);
  }
  const result = await response.json();
  return (result.data ?? result) as T;
}

class FinanceAPI {
  async summary(): Promise<FinanceSummary> {
    const response = await apiFetch('/api/finance/summary', { method: 'GET' });
    return unwrap(response, 'Failed to fetch finance summary');
  }
}

export const financeAPI = new FinanceAPI();

export function useFinanceSummaryQuery() {
  return useQuery({
    queryKey: ['finance-summary'],
    queryFn: () => financeAPI.summary(),
  });
}
