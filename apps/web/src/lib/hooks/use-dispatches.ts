'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiDispatch, CreateDispatchRequest, UpdateDispatchRequest, UpdateDispatchStatusRequest } from '@/lib/api/dispatches';
import { dispatchesAPI } from '@/lib/api/dispatches';

export function useDispatches(page = 1, limit = 10, params?: { search?: string; status?: string; orderId?: string; driverId?: string; vehicleId?: string }) {
  const [data, setData] = useState<{ items: ApiDispatch[]; meta: { page: number; limit: number; total: number; totalPages: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dispatchesAPI.list(page, limit, params);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dispatches');
    } finally {
      setLoading(false);
    }
  }, [page, limit, params]);

  const refetch = useCallback(async () => {
    await fetch();
  }, [fetch]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data: data?.items, meta: data?.meta, loading, error, refetch, fetch };
}

export function useDispatchDetail(id: string) {
  const [data, setData] = useState<ApiDispatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await dispatchesAPI.getById(id);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dispatch');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const refetch = useCallback(async () => {
    await fetch();
  }, [fetch]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch, fetch };
}

export function useCreateDispatch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (data: CreateDispatchRequest) => {
      setLoading(true);
      setError(null);
      try {
        return await dispatchesAPI.create(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create dispatch';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { create, loading, error };
}

export function useUpdateDispatch(id: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    async (data: UpdateDispatchRequest) => {
      setLoading(true);
      setError(null);
      try {
        return await dispatchesAPI.update(id, data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update dispatch';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  return { update, loading, error };
}

export function useUpdateDispatchStatus(id: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateStatus = useCallback(
    async (data: UpdateDispatchStatusRequest) => {
      setLoading(true);
      setError(null);
      try {
        return await dispatchesAPI.updateStatus(id, data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update dispatch status';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  return { updateStatus, loading, error };
}

export function useCancelDispatch(id: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(
    async () => {
      setLoading(true);
      setError(null);
      try {
        return await dispatchesAPI.cancel(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel dispatch';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  return { cancel, loading, error };
}
