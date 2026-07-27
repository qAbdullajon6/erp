import { apiFetch } from './fetch';
import { unwrapResponse } from './error';
import { describeError } from './describe-error';
import { useQuery } from '@tanstack/react-query';
import { dashboardKeys } from './query-keys';

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

export interface DelayedOrderRow {
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName?: string | null;
  status: string;
  pickupCity: string;
  deliveryCity: string;
  deliveryDate: string;
  price: string;
  currency: string;
}

export interface DashboardTodaySnapshot {
  dueToday: number;
  deliveredToday: number;
  pickupsDueToday: number;
}

export interface DashboardSummary {
  currency?: string | null;
  generatedAt?: string;
  today: DashboardTodaySnapshot;
  totals: ExecutiveOverviewTotals;
  revenueVsExpensesTimeSeries: RevenueBucket[];
  ordersByStatus: OrdersByStatusRow[];
  delayedOrders: { total: number; items: DelayedOrderRow[] };
}

export interface BoardOrderSummary {
  id: string;
  orderNumber: string;
  pickupCity: string;
  deliveryCity: string;
  pickupDate: string;
  deliveryDate: string;
  status: string;
  customerName?: string | null;
  price?: string | null;
  currency?: string | null;
  createdAt?: string;
  cargoWeightKg?: string | null;
}

export interface BoardDriverSummary {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: string;
  licenseExpiry?: string | null;
}

export interface BoardVehicleSummary {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  type: string;
  status: string;
  capacityKg?: string | null;
  capacityM3?: string | null;
}

/// The board endpoint returns far more than a count — `busy` carries the
/// actual driver/vehicle plus what they're on right now (Task: dashboard
/// "Live Dispatch"). Previously typed as `unknown[]` and only ever counted
/// with `.length`, which silently discarded this.
export interface DispatchBoardSummary {
  unassignedOrders: BoardOrderSummary[];
  drivers: {
    available: BoardDriverSummary[];
    busy: Array<{ driver: BoardDriverSummary; currentOrder: BoardOrderSummary }>;
    onLeave: BoardDriverSummary[];
    inactive: BoardDriverSummary[];
  };
  vehicles: {
    available: BoardVehicleSummary[];
    busy: Array<{ vehicle: BoardVehicleSummary; currentOrder: BoardOrderSummary }>;
    inUse: BoardVehicleSummary[];
    maintenance: BoardVehicleSummary[];
    inactive: BoardVehicleSummary[];
  };
}

class DashboardAPI {
  private baseUrl = '/api';

  async getDashboardSummary(): Promise<DashboardSummary> {
    const response = await apiFetch(`${this.baseUrl}/reports/dashboard-summary`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to load dashboard overview');
  }

  /// Shared with the real Dispatch Board (use-dispatches.ts's
  /// useDispatchBoardSummary) — kept here as the one fetcher for this
  /// endpoint's response shape, but the dashboard reads it through that
  /// hook so both screens share one cached, invalidated-together query.
  async getDispatchBoard(): Promise<DispatchBoardSummary> {
    const response = await apiFetch(`${this.baseUrl}/dispatch/board`, { method: 'GET' });
    return unwrapResponse(response, 'Failed to load fleet status');
  }
}

export const dashboardAPI = new DashboardAPI();

/// React Query (Task: Dashboard vertical audit) — replaces a hand-rolled
/// Promise.allSettled/useState hook that had no cache, no retry, and a real
/// race: its fetch identity depended on `includeFleet`, which flips
/// asynchronously once the user's role loads, with nothing guarding against
/// an earlier in-flight request resolving after a later one and clobbering
/// state. useQuery removes all three: cached across navigations (30s
/// staleTime, same as every other screen), retried on transient failures,
/// and stale responses are never committed over fresher ones.
export function useDashboardSummary(options: { refetchInterval?: number } = {}) {
  const result = useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: () => dashboardAPI.getDashboardSummary(),
    /// The Command Center is meant to stay open all shift, so it polls itself
    /// live. `refetchInterval` (default: off) does NOT run while the tab is
    /// backgrounded, so an idle manager isn't hammering the API from a hidden
    /// tab; focus returning triggers the normal stale refetch instead.
    refetchInterval: options.refetchInterval,
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    /// A refetch is in flight over data we already have (poll or manual
    /// refresh) — drives the header's spinning indicator without blanking
    /// the widgets to skeletons.
    isFetching: result.isFetching,
    dataUpdatedAt: result.dataUpdatedAt,
    error: result.error ? describeError(result.error, 'Failed to load dashboard overview') : null,
    refetch: result.refetch,
  };
}
