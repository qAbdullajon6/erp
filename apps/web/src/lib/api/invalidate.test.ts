import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateOperationalState } from './invalidate';
import {
  availabilityKeys,
  dispatchKeys,
  driverKeys,
  orderKeys,
  vehicleKeys,
} from './query-keys';

/// Task 8.9 — the cache is only as good as its invalidation.
///
/// These tests drive a REAL QueryClient. What they assert is the thing that
/// actually breaks in production and that no typecheck can catch: after a dispatch
/// moves, does every screen showing a view of it know its data is out of date?
///
/// Under ADR-001 a dispatch, the order projected from it, and who is free are three
/// views of ONE fact. Any mutation that changes the fact must mark all three stale
/// — and must not needlessly refetch the things that did not change.

const WINDOW = { pickupDate: '2038-01-01T08:00:00.000Z', deliveryDate: '2038-01-03T18:00:00.000Z' };

let queryClient: QueryClient;

/// Seeds a query that is already settled and fresh, as a mounted screen would be.
async function seed(key: readonly unknown[], value: unknown = { ok: true }) {
  await queryClient.prefetchQuery({
    queryKey: key,
    queryFn: () => Promise.resolve(value),
    staleTime: 60_000,
  });
}

const isStale = (key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated ?? false;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
});

describe('invalidateOperationalState — the invalidation matrix', () => {
  it('marks every view of the operational fact stale', async () => {
    await seed(orderKeys.list({ page: 1 }));
    await seed(orderKeys.detail('order-1'));
    await seed(dispatchKeys.list({ page: 1 }));
    await seed(dispatchKeys.detail('dispatch-1'));
    await seed(availabilityKeys.window(WINDOW));

    await invalidateOperationalState(queryClient);

    // The order list AND the order detail: a dispatch move changes the projection
    // on both (R3).
    expect(isStale(orderKeys.list({ page: 1 }))).toBe(true);
    expect(isStale(orderKeys.detail('order-1'))).toBe(true);
    expect(isStale(dispatchKeys.list({ page: 1 }))).toBe(true);
    expect(isStale(dispatchKeys.detail('dispatch-1'))).toBe(true);
    expect(isStale(availabilityKeys.window(WINDOW))).toBe(true);
  });

  it('invalidates EVERY cached availability window, not just the one on screen', async () => {
    // A trip booked in June makes the June window stale. From the cache we cannot
    // tell which other cached windows overlap it, and guessing wrong means showing a
    // dispatcher a driver the API is about to refuse.
    const june = { pickupDate: '2038-06-01T00:00:00.000Z', deliveryDate: '2038-06-02T00:00:00.000Z' };
    const july = { pickupDate: '2038-07-01T00:00:00.000Z', deliveryDate: '2038-07-02T00:00:00.000Z' };
    await seed(availabilityKeys.window(june));
    await seed(availabilityKeys.window(july));

    await invalidateOperationalState(queryClient);

    expect(isStale(availabilityKeys.window(june))).toBe(true);
    expect(isStale(availabilityKeys.window(july))).toBe(true);
  });

  it('does NOT invalidate drivers or vehicles — assigning somebody does not rename them', async () => {
    // Their employment status and number plates are untouched by a dispatch. What
    // changed is whether they are BUSY, and that lives in `availability`. Refetching
    // these two lists on every assignment would be pure waste.
    await seed(driverKeys.list({ page: 1 }));
    await seed(vehicleKeys.list({ page: 1 }));

    await invalidateOperationalState(queryClient);

    expect(isStale(driverKeys.list({ page: 1 }))).toBe(false);
    expect(isStale(vehicleKeys.list({ page: 1 }))).toBe(false);
  });

  it('invalidates a screen it has never seen — hierarchical keys, not enumerated ones', async () => {
    // The helper does not know which order detail is open. It invalidates the root,
    // so a detail screen mounted later under any id is covered.
    await seed(orderKeys.detail('an-order-nobody-told-the-helper-about'));

    await invalidateOperationalState(queryClient);

    expect(isStale(orderKeys.detail('an-order-nobody-told-the-helper-about'))).toBe(true);
  });
});

describe('an invalidated query actually refetches when a screen is watching it', () => {
  it('refetches the order projection after a dispatch is completed', async () => {
    const queryFn = vi.fn().mockResolvedValueOnce({ status: 'IN_TRANSIT' }).mockResolvedValueOnce({ status: 'DELIVERED' });

    const observer = queryClient.getQueryCache().build(queryClient, {
      queryKey: orderKeys.detail('order-1'),
      queryFn,
    });
    await observer.fetch();
    expect(queryClient.getQueryData(orderKeys.detail('order-1'))).toEqual({ status: 'IN_TRANSIT' });

    // The dispatch is completed -> the order projection moved to DELIVERED (R7).
    await invalidateOperationalState(queryClient);
    await observer.fetch();

    expect(queryClient.getQueryData(orderKeys.detail('order-1'))).toEqual({ status: 'DELIVERED' });
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('refetches availability after a reassignment releases the old driver', async () => {
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce({ drivers: [{ id: 'beta' }] })
      .mockResolvedValueOnce({ drivers: [{ id: 'alpha' }] });

    const observer = queryClient.getQueryCache().build(queryClient, {
      queryKey: availabilityKeys.window(WINDOW),
      queryFn,
    });
    await observer.fetch();
    expect(queryClient.getQueryData(availabilityKeys.window(WINDOW))).toEqual({
      drivers: [{ id: 'beta' }],
    });

    // Reassigned away from alpha -> alpha is free again.
    await invalidateOperationalState(queryClient);
    await observer.fetch();

    expect(queryClient.getQueryData(availabilityKeys.window(WINDOW))).toEqual({
      drivers: [{ id: 'alpha' }],
    });
  });
});

describe('caching — no duplicate requests', () => {
  it('serves a second read from cache while it is fresh (navigating back)', async () => {
    const queryFn = vi.fn().mockResolvedValue({ items: [] });
    const options = { queryKey: orderKeys.list({ page: 1 }), queryFn, staleTime: 30_000 };

    // Mount the list, leave for a detail screen, come back.
    await queryClient.fetchQuery(options);
    await queryClient.fetchQuery(options);
    await queryClient.fetchQuery(options);

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('two screens asking for the same data at once produce ONE request', async () => {
    const queryFn = vi.fn().mockResolvedValue({ items: [] });
    const options = { queryKey: dispatchKeys.list({ page: 1 }), queryFn };

    await Promise.all([queryClient.fetchQuery(options), queryClient.fetchQuery(options)]);

    // React Query deduplicates in-flight requests for the same key — but only if
    // both callers spell the key the same way, which is what the shared factory
    // guarantees.
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('but refetches once the data has been invalidated', async () => {
    const queryFn = vi.fn().mockResolvedValue({ items: [] });
    const options = { queryKey: orderKeys.list({ page: 1 }), queryFn, staleTime: 30_000 };

    await queryClient.fetchQuery(options);
    await invalidateOperationalState(queryClient);
    await queryClient.fetchQuery(options);

    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('a different query param is a different question, and is fetched separately', async () => {
    const queryFn = vi.fn().mockResolvedValue({ items: [] });

    await queryClient.fetchQuery({ queryKey: orderKeys.list({ page: 1 }), queryFn });
    await queryClient.fetchQuery({ queryKey: orderKeys.list({ page: 2 }), queryFn });

    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});

describe('query keys are hierarchical and distinct', () => {
  it('a detail key sits under its root, so invalidating the root catches it', () => {
    expect(orderKeys.detail('x').slice(0, 1)).toEqual([...orderKeys.all]);
    expect(dispatchKeys.detail('x').slice(0, 1)).toEqual([...dispatchKeys.all]);
  });

  it('the five roots do not collide', () => {
    const roots = [orderKeys.all, dispatchKeys.all, availabilityKeys.all, driverKeys.all, vehicleKeys.all];
    const flat = roots.map((r) => r.join('/'));
    expect(new Set(flat).size).toBe(roots.length);
  });

  it('availability is keyed by its window — two trips are two questions', () => {
    const a = availabilityKeys.window({ pickupDate: '2038-01-01', deliveryDate: '2038-01-02' });
    const b = availabilityKeys.window({ pickupDate: '2038-06-01', deliveryDate: '2038-06-02' });
    expect(a).not.toEqual(b);
  });
});
