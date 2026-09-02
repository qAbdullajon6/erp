import { describe, expect, it } from 'vitest';
import type { BoardOrderSummary } from '@/lib/api/dashboard';
import { buildWorkQueue } from './work-queue';

function order(overrides: Partial<BoardOrderSummary> = {}): BoardOrderSummary {
  return {
    id: 'order-1',
    orderNumber: 'ORD-001',
    pickupCity: 'Tashkent',
    deliveryCity: 'Samarkand',
    pickupDate: '2038-01-01T00:00:00.000Z',
    deliveryDate: '2038-01-03T00:00:00.000Z',
    status: 'PENDING',
    customerName: 'Acme',
    createdAt: '2038-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildWorkQueue — needs_assignment section', () => {
  it('labels a brand-new unassigned order as Unassigned with warning tone', () => {
    const items = buildWorkQueue([], [order()], null);
    expect(items).toHaveLength(1);
    expect(items[0].section).toBe('needs_assignment');
    expect(items[0].riskLabel).toBe('Unassigned');
    expect(items[0].tone).toBe('warning');
  });

  it('labels an order with a previous DELIVERY_FAILED dispatch as Re-dispatch needed with destructive tone', () => {
    const items = buildWorkQueue(
      [],
      [order({ lastFailedDelivery: { failureReason: 'CUSTOMER_UNAVAILABLE' } })],
      null,
    );
    expect(items).toHaveLength(1);
    expect(items[0].riskLabel).toBe('Re-dispatch needed');
    expect(items[0].tone).toBe('destructive');
  });

  it('treats lastFailedDelivery: null the same as absent (standard Unassigned)', () => {
    const items = buildWorkQueue([], [order({ lastFailedDelivery: null })], null);
    expect(items[0].riskLabel).toBe('Unassigned');
    expect(items[0].tone).toBe('warning');
  });

  it('sorts unassigned orders by pickupDate ascending regardless of failure flag', () => {
    const items = buildWorkQueue(
      [],
      [
        order({ id: 'late', orderNumber: 'ORD-002', pickupDate: '2038-01-05T00:00:00.000Z' }),
        order({ id: 'early', orderNumber: 'ORD-001', pickupDate: '2038-01-02T00:00:00.000Z', lastFailedDelivery: { failureReason: 'WRONG_ADDRESS' } }),
      ],
      null,
    );
    expect(items.map((i) => i.id)).toEqual(['early', 'late']);
  });
});
