import { useQuery } from '@tanstack/react-query';
import { portalFetch } from './portal-fetch';
import { unwrapResponse as unwrap } from './error';
import { portalOrderKeys } from './portal-query-keys';
import { describeError } from './describe-error';

export type PortalOrderStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

export interface PortalOrderItem {
  id: string;
  orderNumber: string;
  pickupAddress: string;
  pickupCity: string;
  pickupDate: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDate: string;
  cargoDescription: string;
  status: PortalOrderStatus;
  isDelayed: boolean;
  notes: string | null;
  deliveryNotes: string | null;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  statusHistory?: PortalOrderStatusHistoryEntry[];
}

export interface PortalOrderStatusHistoryEntry {
  id: string;
  status: PortalOrderStatus;
  note: string | null;
  createdAt: string;
}

export interface PortalTimelineEvent {
  id: string;
  kind: 'ORDER' | 'DISPATCH';
  status: string;
  label: string;
  note: string | null;
  createdAt: string;
}

export interface PortalShipmentSummary {
  dispatchNumber: string;
  status: string;
  driverName: string;
  vehiclePlate: string | null;
  vehicleCode: string | null;
}

export interface PortalDeliveryProof {
  id: string;
  type: 'PHOTO' | 'SIGNATURE' | string;
  fileName: string;
  mimeType: string;
  receiverName: string | null;
  receiverPhone: string | null;
  notes: string | null;
  odometerKm: string | null;
  createdAt: string;
  downloadUrl: string;
}

export interface PortalOrderDetail extends PortalOrderItem {
  shipment?: PortalShipmentSummary | null;
}

export interface PortalOrderTracking {
  orderId: string;
  status: PortalOrderStatus;
  tracking: {
    latitude: number;
    longitude: number;
    speedKph: number | null;
    heading: number | null;
    movementState: string | null;
    lastUpdatedAt: string;
  } | null;
  message?: string;
}

export interface ListPortalOrdersResponse {
  items: PortalOrderItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListPortalOrdersQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: PortalOrderStatus;
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

class PortalOrdersAPI {
  private baseUrl = '/api/customer-portal/orders';

  async list(query: ListPortalOrdersQuery = {}): Promise<ListPortalOrdersResponse> {
    const response = await portalFetch(`${this.baseUrl}${buildQuery(query)}`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch orders');
  }

  async getById(id: string): Promise<PortalOrderDetail> {
    const response = await portalFetch(`${this.baseUrl}/${id}`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch order');
  }

  async getTimeline(id: string): Promise<PortalTimelineEvent[]> {
    const response = await portalFetch(`${this.baseUrl}/${id}/timeline`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch order timeline');
  }

  async getTracking(id: string): Promise<PortalOrderTracking> {
    const response = await portalFetch(`${this.baseUrl}/${id}/tracking`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch shipment tracking');
  }

  async getDeliveryProofs(id: string): Promise<{ items: PortalDeliveryProof[] }> {
    const response = await portalFetch(`${this.baseUrl}/${id}/delivery-proof`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch delivery proofs');
  }
}

export const portalOrdersAPI = new PortalOrdersAPI();

export function usePortalOrdersList(query: ListPortalOrdersQuery = {}) {
  const result = useQuery({
    queryKey: portalOrderKeys.list(query),
    queryFn: () => portalOrdersAPI.list(query),
  });

  return {
    data: result.data?.items ?? [],
    meta: result.data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load orders') : null,
    refetch: result.refetch,
  };
}

export function usePortalOrder(id: string) {
  const result = useQuery({
    queryKey: portalOrderKeys.detail(id),
    queryFn: () => portalOrdersAPI.getById(id),
    enabled: Boolean(id),
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load order') : null,
    refetch: result.refetch,
  };
}

export function usePortalOrderTimeline(id: string) {
  return useQuery({
    queryKey: [...portalOrderKeys.detail(id), 'timeline'],
    queryFn: () => portalOrdersAPI.getTimeline(id),
    enabled: Boolean(id),
  });
}

export function usePortalOrderTracking(id: string, enabled = true) {
  return useQuery({
    queryKey: [...portalOrderKeys.detail(id), 'tracking'],
    queryFn: () => portalOrdersAPI.getTracking(id),
    enabled: Boolean(id) && enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.tracking) return false;
      const live = data.status === 'ASSIGNED' || data.status === 'PICKED_UP' || data.status === 'IN_TRANSIT';
      return live ? 30_000 : false;
    },
  });
}

export function usePortalOrderDeliveryProofs(id: string) {
  return useQuery({
    queryKey: [...portalOrderKeys.detail(id), 'delivery-proof'],
    queryFn: () => portalOrdersAPI.getDeliveryProofs(id),
    enabled: Boolean(id),
  });
}
