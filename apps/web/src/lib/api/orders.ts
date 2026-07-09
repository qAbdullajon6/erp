import { apiFetch } from './fetch';
import { useState, useCallback, useEffect } from 'react';

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

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Failed to fetch orders: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data || result;
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to create order');
    }

    const result = await response.json();
    return result.data;
  }

  async updateOrder(id: string, input: UpdateOrderInput): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to update order');
    }

    const result = await response.json();
    return result.data;
  }

  async assignOrder(id: string, input: AssignOrderInput): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to assign order');
    }

    const result = await response.json();
    return result.data;
  }

  async updateOrderStatus(id: string, input: UpdateOrderStatusInput): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}/status`, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to update order status');
    }

    const result = await response.json();
    return result.data;
  }

  async cancelOrder(id: string, input: CancelOrderInput = {}): Promise<Order> {
    const response = await apiFetch(`${this.baseUrl}/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to cancel order');
    }

    const result = await response.json();
    return result.data;
  }
}

export const ordersAPI = new OrdersAPI();

// Hooks
export function useOrdersList(query: ListOrdersQuery = {}) {
  const [data, setData] = useState<Order[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ordersAPI.listOrders(query);
      setData(result.items);
      setMeta(result.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [query.page, query.limit, query.search, query.status, query.customerId, query.driverId, query.vehicleId, query.sortBy, query.sortOrder]);

  // Auto-fetch on mount and whenever the query changes. `fetch` is keyed off
  // the individual query fields (not the object identity), so this settles
  // after one request per distinct query rather than looping.
  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, meta, loading, error, refetch: fetch };
}

export function useOrder(id: string) {
  const [data, setData] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await ordersAPI.getOrder(id);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // `loading` starts true, so without this the order detail screen renders its
  // skeleton forever. Matches useDriver/useVehicle/useCustomerDetail.
  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useCreateOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateOrderInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await ordersAPI.createOrder(input);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create order';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
}

export function useUpdateOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(async (id: string, input: UpdateOrderInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await ordersAPI.updateOrder(id, input);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update order';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { update, loading, error };
}

export function useAssignOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assign = useCallback(async (id: string, input: AssignOrderInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await ordersAPI.assignOrder(id, input);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign order';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { assign, loading, error };
}

export function useUpdateOrderStatus() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateStatus = useCallback(async (id: string, input: UpdateOrderStatusInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await ordersAPI.updateOrderStatus(id, input);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update order status';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { updateStatus, loading, error };
}

export function useCancelOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(async (id: string, input: CancelOrderInput = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await ordersAPI.cancelOrder(id, input);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel order';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { cancel, loading, error };
}
