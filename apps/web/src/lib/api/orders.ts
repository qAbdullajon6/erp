import { useMutation, useQuery } from '@tanstack/react-query';
import { describeError } from './describe-error';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';
import { useInvalidateOperationalState } from './invalidate';
import { orderKeys } from './query-keys';

export type OrderStatus = 'DRAFT' | 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export interface Order {
  id: string;
  organizationId: string;
  orderNumber: string;
  customerId: string;
  pickupAddress: string;
  pickupCity: string;
  pickupDate: string; // ISO date
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDate: string; // ISO date
  cargoDescription: string;
  cargoWeightKg: string | null;
  cargoVolumeM3: string | null;
  price: string; // decimal as string
  currency: string;
  status: OrderStatus;
  /// Which statuses this order may legally move to, straight from the server's own
  /// transition table (TD-006). The UI does not decide this and must never try: two
  /// separate frontend copies of that table used to exist. Empty = terminal.
  allowedTransitions: OrderStatus[];
  isDelayed: boolean;
  driverId: string | null;
  vehicleId: string | null;
  notes: string | null;
  deliveryNotes: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  deliveredAt: string | null;
  statusHistory?: OrderStatusHistoryEntry[];
}

export interface OrderStatusHistoryEntry {
  id: string;
  status: OrderStatus;
  changedByUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface ListOrdersResponse {
  items: Order[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateOrderInput {
  customerId: string;
  orderNumber?: string;
  pickupAddress: string;
  pickupCity: string;
  pickupDate: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDate: string;
  cargoDescription: string;
  cargoWeightKg?: number;
  cargoVolumeM3?: number;
  price: number;
  currency?: string;
  notes?: string;
  deliveryNotes?: string;
}

export interface UpdateOrderInput {
  orderNumber?: string;
  customerId?: string;
  pickupAddress?: string;
  pickupCity?: string;
  pickupDate?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryDate?: string;
  cargoDescription?: string;
  cargoWeightKg?: number;
  cargoVolumeM3?: number;
  price?: number;
  currency?: string;
  notes?: string;
  deliveryNotes?: string;
}

export interface AssignOrderInput {
  driverId: string;
  vehicleId: string;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
  note?: string;
}

export interface CancelOrderInput {
  note?: string;
}

export interface ListOrdersQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
  customerId?: string;
  driverId?: string;
  vehicleId?: string;
  sortBy?: 'orderNumber' | 'pickupDate' | 'deliveryDate' | 'price' | 'status' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

class OrdersAPI {
  private baseUrl = '/api';

  async listOrders(query: ListOrdersQuery = {}): Promise<ListOrdersResponse> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());
    if (query.search) params.append('search', query.search);
    if (query.status) params.append('status', query.status);
    if (query.customerId) params.append('customerId', query.customerId);
    if (query.driverId) params.append('driverId', query.driverId);
    if (query.vehicleId) params.append('vehicleId', query.vehicleId);
    if (query.sortBy) params.append('sortBy', query.sortBy);
    if (query.sortOrder) params.append('sortOrder', query.sortOrder);

    const queryString = params.toString();
    const url = queryString ? `${this.baseUrl}/orders?${queryString}` : `${this.baseUrl}/orders`;

    const response = await apiFetch(url, { method: 'GET' });

    return unwrapResponse(response, 'Failed to fetch orders');
  }

  async getOrder(id: string): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}`, { method: 'GET' });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Order not found');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Failed to fetch order: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return unwrapResponse(response, 'Failed to create order');
  }

  async updateOrder(id: string, input: UpdateOrderInput): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });

    return unwrapResponse(response, 'Failed to update order');
  }

  async assignOrder(id: string, input: AssignOrderInput): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return unwrapResponse(response, 'Failed to assign order');
  }

  async updateOrderStatus(id: string, input: UpdateOrderStatusInput): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}/status`, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return unwrapResponse(response, 'Failed to update order status');
  }

  async cancelOrder(id: string, input: CancelOrderInput = {}): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return unwrapResponse(response, 'Failed to cancel order');
  }
}

export const ordersAPI = new OrdersAPI();

/// Hooks — React Query (Task 8.9).
///
/// The return shapes below deliberately match what the manual hooks returned
/// (`data` / `loading` / `error` / `refetch`, and `assign` / `cancel` / ...), so the
/// screens did not have to be rewritten around a new API. What changed is
/// underneath: there is no hand-rolled fetch state any more, and — crucially — no
/// mutation calls `refetch()` on its neighbours. Server state is invalidated, and
/// React Query refetches whatever is actually on screen.

export function useOrdersList(query: ListOrdersQuery = {}) {
  const result = useQuery({
    queryKey: orderKeys.list(query),
    queryFn: () => ordersAPI.listOrders(query),
  });

  return {
    data: result.data?.items ?? [],
    meta: result.data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load orders') : null,
    refetch: result.refetch,
  };
}

export function useOrder(id: string) {
  const result = useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => ordersAPI.getOrder(id),
    enabled: Boolean(id),
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load order') : null,
    refetch: result.refetch,
  };
}

export function useCreateOrder() {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: (input: CreateOrderInput) => ordersAPI.createOrder(input),
    onSuccess: invalidate,
  });

  return {
    create: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to create order') : null,
  };
}

export function useUpdateOrder() {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOrderInput }) =>
      ordersAPI.updateOrder(id, input),
    onSuccess: invalidate,
  });

  return {
    update: (id: string, input: UpdateOrderInput) => mutation.mutateAsync({ id, input }),
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to update order') : null,
  };
}

/// Assigning an order creates or reassigns a DISPATCH (ADR-001, Task 8.7), which
/// moves the order projection and takes a driver and a vehicle out of the pool. All
/// three views are invalidated by the shared helper — no screen refetches another.
export function useAssignOrder() {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssignOrderInput }) =>
      ordersAPI.assignOrder(id, input),
    onSuccess: invalidate,
  });

  return {
    assign: (id: string, input: AssignOrderInput) => mutation.mutateAsync({ id, input }),
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to assign order') : null,
  };
}

export function useUpdateOrderStatus() {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOrderStatusInput }) =>
      ordersAPI.updateOrderStatus(id, input),
    onSuccess: invalidate,
  });

  return {
    updateStatus: (id: string, input: UpdateOrderStatusInput) =>
      mutation.mutateAsync({ id, input }),
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to update order status') : null,
  };
}

export function useCancelOrder() {
  const invalidate = useInvalidateOperationalState();
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CancelOrderInput }) =>
      ordersAPI.cancelOrder(id, input),
    onSuccess: invalidate,
  });

  return {
    cancel: (id: string, input: CancelOrderInput = {}) => mutation.mutateAsync({ id, input }),
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to cancel order') : null,
  };
}
