import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse } from './error';
import { financeSummaryKeys } from './query-keys';

export interface FinanceSummary {
  currency: string;
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
  excludedOtherCurrencyCount: number;
}

export interface FinanceLookupItem {
  id: string;
  code: string;
  label: string;
}

/// See expenses.ts — the local copy read the wrong field on the error envelope
/// and threw a status-less Error.
const unwrap = unwrapResponse;

class FinanceAPI {
  async summary(): Promise<FinanceSummary> {
    const response = await apiFetch('/api/finance/summary', { method: 'GET' });
    return unwrap(response, 'Failed to fetch finance summary');
  }

  async lookupDrivers(): Promise<{ items: FinanceLookupItem[] }> {
    const response = await apiFetch('/api/finance/lookups/drivers', { method: 'GET' });
    return unwrap(response, 'Failed to load drivers');
  }

  async lookupVehicles(): Promise<{ items: FinanceLookupItem[] }> {
    const response = await apiFetch('/api/finance/lookups/vehicles', { method: 'GET' });
    return unwrap(response, 'Failed to load vehicles');
  }
}

export const financeAPI = new FinanceAPI();

export function useFinanceSummaryQuery() {
  return useQuery({
    queryKey: financeSummaryKeys.all,
    queryFn: () => financeAPI.summary(),
  });
}

export function useFinanceDriverLookupsQuery(enabled: boolean) {
  return useQuery({
    queryKey: [...financeSummaryKeys.all, 'lookups', 'drivers'] as const,
    queryFn: () => financeAPI.lookupDrivers(),
    enabled,
  });
}

export function useFinanceVehicleLookupsQuery(enabled: boolean) {
  return useQuery({
    queryKey: [...financeSummaryKeys.all, 'lookups', 'vehicles'] as const,
    queryFn: () => financeAPI.lookupVehicles(),
    enabled,
  });
}
