import { apiFetch } from './fetch';
import { useState, useCallback, useEffect } from 'react';

export type VehicleStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE';

export interface Vehicle {
  id: string;
  organizationId: string;
  vehicleCode: string;
  plateNumber: string;
  type: string;
  capacityKg: string | null;
  capacityM3: string | null;
  status: VehicleStatus;
  make: string | null;
  model: string | null;
  year: number | null;
  insuranceExpiry: string | null;
  inspectionExpiry: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleInput {
  vehicleCode?: string;
  plateNumber: string;
  type: string;
  capacityKg?: number;
  capacityM3?: number;
  make?: string;
  model?: string;
  year?: number;
  insuranceExpiry?: string;
  inspectionExpiry?: string;
}

export interface UpdateVehicleInput {
  vehicleCode?: string;
  plateNumber?: string;
  type?: string;
  capacityKg?: number;
  capacityM3?: number;
  status?: VehicleStatus;
  make?: string;
  model?: string;
  year?: number;
  insuranceExpiry?: string;
  inspectionExpiry?: string;
}

export interface ListVehiclesResponse {
  items: Vehicle[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class VehiclesAPI {
  async list(query?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: VehicleStatus;
    includeArchived?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ListVehiclesResponse> {
    const params = new URLSearchParams();
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    if (query?.search) params.append('search', query.search);
    if (query?.status) params.append('status', query.status);
    if (query?.includeArchived) params.append('includeArchived', String(query.includeArchived));
    if (query?.sortBy) params.append('sortBy', query.sortBy);
    if (query?.sortOrder) params.append('sortOrder', query.sortOrder);

    const response = await apiFetch(
      `/api/vehicles${params.size > 0 ? `?${params.toString()}` : ''}`,
      { method: 'GET' }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Failed to fetch vehicles: ${response.statusText}`);
    }
    const result = await response.json();
    return result.data || result;
  }

  async getById(id: string): Promise<Vehicle> {
    const response = await apiFetch(`/api/vehicles/${id}`, { method: 'GET' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Failed to fetch vehicle: ${response.statusText}`);
    }
    const result = await response.json();
    return result.data || result;
  }

  async create(input: CreateVehicleInput): Promise<Vehicle> {
    const response = await apiFetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to create vehicle');
    }
    const result = await response.json();
    return result.data || result;
  }

  async update(id: string, input: UpdateVehicleInput): Promise<Vehicle> {
    const response = await apiFetch(`/api/vehicles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to update vehicle');
    }
    const result = await response.json();
    return result.data || result;
  }

  async archive(id: string): Promise<Vehicle> {
    const response = await apiFetch(`/api/vehicles/${id}/archive`, { method: 'POST' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to archive vehicle');
    }
    const result = await response.json();
    return result.data || result;
  }

  async restore(id: string): Promise<Vehicle> {
    const response = await apiFetch(`/api/vehicles/${id}/restore`, { method: 'POST' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to restore vehicle');
    }
    const result = await response.json();
    return result.data || result;
  }
}

export const vehiclesAPI = new VehiclesAPI();

export function useVehiclesList(query?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: VehicleStatus;
  includeArchived?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const [data, setData] = useState<ListVehiclesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await vehiclesAPI.list(query);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch vehicles');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useVehicle(id: string) {
  const [data, setData] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await vehiclesAPI.getById(id);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch vehicle');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useCreateVehicle() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async (input: CreateVehicleInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await vehiclesAPI.create(input);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create vehicle';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutate, loading, error };
}

export function useUpdateVehicle(id: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (input: UpdateVehicleInput) => {
      setLoading(true);
      setError(null);
      try {
        const result = await vehiclesAPI.update(id, input);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update vehicle';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  return { mutate, loading, error };
}

export function useArchiveVehicle(id: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await vehiclesAPI.archive(id);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive vehicle';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [id]);

  return { mutate, loading, error };
}

export function useRestoreVehicle(id: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await vehiclesAPI.restore(id);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore vehicle';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [id]);

  return { mutate, loading, error };
}
