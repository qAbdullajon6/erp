import { apiFetch } from './fetch';
import { useCallback, useEffect, useState } from 'react';

export interface ExecutiveOverviewTotals {
  totalOrders: number;
  deliveredOrders: number;
  activeOrders: number;
  delayedOrders: number;
  totalRevenue: string;
  approvedExpenses: string;
  estimatedGrossProfit: string;
  totalInvoiced: string;
  totalCollected: string;
  outstandingReceivables: string;
  deliveryCompletionRate: number;
  onTimeDeliveryRate: number;
}

export interface RevenueBucket {
  bucket: string;
  revenue: number;
  expenses: number;
}

export interface OrdersByStatusRow {
  status: string;
  count: number;
}

export interface ExecutiveOverview {
  totals: ExecutiveOverviewTotals;
  revenueVsExpensesTimeSeries: RevenueBucket[];
  ordersByStatus: OrdersByStatusRow[];
}

export interface DelayedOrderRow {
  orderId: string;
  orderNumber: string;
  customerId: string;
  status: string;
  pickupCity: string;
  deliveryCity: string;
  deliveryDate: string;
  price: string;
  currency: string;
}

export interface DispatchResourceGroup {
  available: unknown[];
  busy: unknown[];
  [key: string]: unknown[];
}

export interface DispatchBoardSummary {
  drivers: DispatchResourceGroup;
  vehicles: DispatchResourceGroup;
}

export interface RecentOrderRow {
  id: string;
  orderNumber: string;
  pickupCity: string;
  deliveryCity: string;
  price: string;
  currency: string;
  status: string;
  createdAt: string;
}

class DashboardAPI {
  private baseUrl = '/api';

  async getExecutiveOverview(): Promise<ExecutiveOverview> {
    const response = await apiFetch(`${this.baseUrl}/reports/executive-overview`, { method: 'GET' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to load dashboard overview');
    }
    const result = await response.json();
    return result.data || result;
  }

  async getDelayedOrders(): Promise<DelayedOrderRow[]> {
    const response = await apiFetch(`${this.baseUrl}/reports/operations`, { method: 'GET' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to load delayed deliveries');
    }
    const result = await response.json();
    const data = result.data || result;
    return data.exceptions?.delayedOrders ?? [];
  }

  async getDispatchBoard(): Promise<DispatchBoardSummary> {
    const response = await apiFetch(`${this.baseUrl}/dispatch/board`, { method: 'GET' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to load fleet status');
    }
    const result = await response.json();
    return result.data || result;
  }

  async getRecentOrders(limit = 5): Promise<RecentOrderRow[]> {
    const params = new URLSearchParams({
      limit: String(limit),
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    const response = await apiFetch(`${this.baseUrl}/orders?${params.toString()}`, { method: 'GET' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to load recent orders');
    }
    const result = await response.json();
    const data = result.data || result;
    return data.items ?? [];
  }
}

export const dashboardAPI = new DashboardAPI();

/// `includeFleet` should be false for roles without dispatch/board access
/// (SALES_CRM_MANAGER) so the page doesn't fire a request guaranteed to
/// 403 — see DispatchController's role list.
export function useDashboardData(includeFleet: boolean) {
  const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
  const [delayedOrders, setDelayedOrders] = useState<DelayedOrderRow[]>([]);
  const [board, setBoard] = useState<DispatchBoardSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewResult, delayedResult, recentResult, boardResult] = await Promise.all([
        dashboardAPI.getExecutiveOverview(),
        dashboardAPI.getDelayedOrders(),
        dashboardAPI.getRecentOrders(5),
        includeFleet ? dashboardAPI.getDispatchBoard() : Promise.resolve(null),
      ]);
      setOverview(overviewResult);
      setDelayedOrders(delayedResult);
      setRecentOrders(recentResult);
      setBoard(boardResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [includeFleet]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { overview, delayedOrders, recentOrders, board, loading, error, refetch: fetchAll };
}
