import { describe, expect, it } from 'vitest';
import {
  buildCustomerTimelineEvents,
  customerDispatchStatusLabel,
  customerOrderStatusLabel,
  customerSafeTimelineNote,
} from './customer-timeline.builder';

describe('customer-timeline.builder', () => {
  it('hides DRAFT order statuses', () => {
    expect(customerOrderStatusLabel('DRAFT')).toBeNull();
    expect(customerOrderStatusLabel('DELIVERED')).toBe('Delivered');
  });

  it('maps dispatch statuses to customer-friendly labels', () => {
    expect(customerDispatchStatusLabel('EN_ROUTE_TO_PICKUP')).toBe('On the way to pickup');
    expect(customerDispatchStatusLabel('AT_PICKUP')).toBe('At pickup');
    expect(customerDispatchStatusLabel('DRAFT')).toBeNull();
  });

  it('strips audit-looking notes', () => {
    expect(customerSafeTimelineNote('audit: reassigned')).toBeNull();
    expect(customerSafeTimelineNote('Left at front desk')).toBe('Left at front desk');
  });

  it('builds a filtered timeline', () => {
    const events = buildCustomerTimelineEvents([
      { id: '1', kind: 'ORDER', status: 'DRAFT', createdAt: '2026-01-01' },
      { id: '2', kind: 'ORDER', status: 'PENDING', createdAt: '2026-01-02' },
      {
        id: '3',
        kind: 'DISPATCH',
        status: 'EN_ROUTE_TO_PICKUP',
        note: 'On road',
        createdAt: '2026-01-03',
      },
    ]);
    expect(events).toHaveLength(2);
    expect(events[0].label).toBe('Pending');
    expect(events[1].label).toBe('On the way to pickup');
  });
});
