import { useQuery } from '@tanstack/react-query';
import { portalFetch } from './portal-fetch';
import { portalDashboardKeys } from './portal-query-keys';
import { describeError } from './describe-error';
import type { PortalOrderItem } from './portal-orders';

export interface PortalDashboardData {
  openOrdersCount: number;
  deliveredThisMonth: number;
  /// Decimal STRING (e.g. "1234.56"), not a JS number — the backend serializes
  /// every monetary value this way to avoid floating-point precision loss.
  /// formatMoney() (lib/format.ts) accepts either, so display code needs no
  /// change; this only fixes the type to match what the API actually returns.
  outstandingBalance: string;
  outstandingInvoiceCount: number;
  recentOrders: PortalOrderItem[];
  upcomingDeliveries: Array<{
    id: string;
    orderNumber: string;
    deliveryDate: string;
    pickupCity: string;
    deliveryCity: string;
    status: string;
  }>;
  unreadNotificationCount: number;
}

class PortalDashboardAPI {
  private baseUrl = '/api/customer-portal/dashboard';

  async get(): Promise<PortalDashboardData> {
    const response = await portalFetch(this.baseUrl, { method: 'GET' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to fetch dashboard');
    }
    const result = await response.json();
    return result.data;
  }
}

export const portalDashboardAPI = new PortalDashboardAPI();

export function usePortalDashboard() {
  const result = useQuery({
    queryKey: portalDashboardKeys.data(),
    queryFn: () => portalDashboardAPI.get(),
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load dashboard') : null,
    refetch: result.refetch,
  };
}
