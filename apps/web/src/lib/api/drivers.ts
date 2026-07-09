import { apiFetch } from './fetch';
import { useState, useCallback, useEffect } from 'react';

export type DriverStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

export interface Driver {
  id: string;
  organizationId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  status: DriverStatus;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDriverInput {
  employeeCode?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
}

export interface UpdateDriverInput {
  employeeCode?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  status?: DriverStatus;
  licenseNumber?: string;
  licenseExpiry?: string;
}

export interface ListDriversResponse {
  items: Driver[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class DriversAPI {
  async list(query?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: DriverStatus;
    includeArchived?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ListDriversResponse> {
    const params = new URLSearchParams();
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    if (query?.search) params.append('search', query.search);
    if (query?.status) params.append('status', query.status);
    if (query?.includeArchived) params.append('includeArchived', String(query.includeArchived));
    if (query?.sortBy) params.append('sortBy', query.sortBy);
    if (query?.sortOrder) params.append('sortOrder', query.sortOrder);

    const response = await apiFetch(
      `/api/drivers${params.size > 0 ? `?${params.toString()}` : ''}`,
      { method: 'GET' }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Failed to fetch drivers: ${response.statusText}`);
    }
    const result = await response.json();
    return result.data || result;
  }

  async getById(id: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}`, { method: 'GET' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Failed to fetch driver: ${response.statusText}`);
    }
    const result = await response.json();
    return result.data || result;
  }

  async create(input: CreateDriverInput): Promise<Driver> {
    const response = await apiFetch('/api/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to create driver');
    }
    const result = await response.json();
    return result.data || result;
  }

  async update(id: string, input: UpdateDriverInput): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to update driver');
    }
    const result = await response.json();
    return result.data || result;
  }

  async archive(id: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}/archive`, { method: 'POST' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to archive driver');
    }
    const result = await response.json();
    return result.data || result;
  }

  async restore(id: string): Promise<Driver> {
    const response = await apiFetch(`/api/drivers/${id}/restore`, { method: 'POST' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to restore driver');
    }
    const result = await response.json();
    return result.data || result;
  }
}

export const driversAPI = new DriversAPI();

export function useDriversList(query?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: DriverStatus;
  includeArchived?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const [data, setData] = useState<ListDriversResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await driversAPI.list(query);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch drivers');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useDriver(id: string) {
  const [data, setData] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await driversAPI.getById(id);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch driver');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useCreateDriver() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async (input: CreateDriverInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await driversAPI.create(input);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create driver';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutate, loading, error };
}

export function useUpdateDriver(id: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (input: UpdateDriverInput) => {
      setLoading(true);
      setError(null);
      try {
        const result = await driversAPI.update(id, input);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update driver';
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

export function useArchiveDriver(id: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await driversAPI.archive(id);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive driver';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [id]);

  return { mutate, loading, error };
}

export function useRestoreDriver(id: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await driversAPI.restore(id);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore driver';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [id]);

  return { mutate, loading, error };
}
