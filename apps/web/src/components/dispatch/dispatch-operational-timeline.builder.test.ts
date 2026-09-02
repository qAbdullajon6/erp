import { describe, expect, it } from 'vitest';
import type { AuditLogEntry } from '@/lib/api/audit-logs';
import type { ApiDispatch } from '@/lib/api/dispatches';
import {
  buildDispatchOperationalTimeline,
  filterTimelineEvents,
  netFieldDiffs,
  sortTimelineEventsDesc,
  type OperationalTimelineEvent,
} from './dispatch-operational-timeline.builder';

function audit(partial: Partial<AuditLogEntry> & Pick<AuditLogEntry, 'action'>): AuditLogEntry {
  return {
    id: partial.id ?? 'audit-1',
    organizationId: 'org-1',
    actorUserId: 'user-1',
    action: partial.action,
    entityType: partial.entityType ?? 'Dispatch',
    entityId: partial.entityId ?? 'dispatch-1',
    metadata: partial.metadata ?? null,
    createdAt: partial.createdAt ?? '2026-07-29T09:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-07-29T09:00:00.000Z',
    actor: partial.actor ?? {
      id: 'user-1',
      firstName: 'Abdullajon',
      lastName: 'Q.',
      email: 'admin@test.com',
    },
  };
}

const baseDispatch: ApiDispatch = {
  id: 'dispatch-1',
  organizationId: 'org-1',
  orderId: 'order-1',
  dispatchNumber: 'DSP-001',
  status: 'IN_TRANSIT',
  driverId: 'driver-2',
  vehicleId: 'vehicle-2',
  pickupDateScheduled: '2026-07-29T08:00:00.000Z',
  deliveryDateScheduled: '2026-07-29T18:00:00.000Z',
  pickupDateActual: null,
  deliveryDateActual: null,
  notes: undefined,
  allowedTransitions: [],
  routeContext: [],
  statusHistory: [],
  createdAt: '2026-07-29T09:00:00.000Z',
  updatedAt: '2026-07-29T09:00:00.000Z',
};

describe('buildDispatchOperationalTimeline', () => {
  it('maps dispatch.create with actor', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: baseDispatch,
      dispatchAuditLogs: [
        audit({
          action: 'dispatch.create',
          metadata: { dispatchNumber: 'DSP-001' },
        }),
      ],
    });
    expect(events[0].title).toBe('Dispatch created');
    expect(events[0].kind).toBe('create');
    expect(events[0].actor).toBe('Abdullajon Q.');
  });

  it('renders driver and vehicle diffs on reassign', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: baseDispatch,
      dispatchAuditLogs: [
        audit({
          action: 'dispatch.reassign',
          metadata: {
            from: { driverId: 'driver-1', vehicleId: 'vehicle-1' },
            to: { driverId: 'driver-2', vehicleId: 'vehicle-2' },
          },
        }),
      ],
      resolveDriverName: (id) =>
        id === 'driver-1' ? 'Dilnoza E.' : id === 'driver-2' ? 'Shohruh' : '—',
      resolveVehiclePlate: (id) =>
        id === 'vehicle-1' ? '01A222BB' : id === 'vehicle-2' ? '01A111AA' : '—',
    });
    expect(events[0].diffs).toEqual([
      { label: 'Driver', from: 'Dilnoza E.', to: 'Shohruh' },
      { label: 'Vehicle', from: '01A222BB', to: '01A111AA' },
    ]);
  });

  it('maps driver status change to gps-friendly title', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: baseDispatch,
      dispatchAuditLogs: [
        audit({
          action: 'dispatch.driver_status_change',
          createdAt: '2026-07-29T09:40:00.000Z',
          metadata: { from: 'EN_ROUTE_TO_PICKUP', to: 'AT_PICKUP' },
        }),
      ],
    });
    expect(events[0].title).toBe('Driver arrived at pickup');
    expect(events[0].categories).toContain('gps');
    expect(events[0].kind).toBe('gps');
  });

  it('uses status kind for dispatcher status_change (consistent icon)', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: baseDispatch,
      dispatchAuditLogs: [
        audit({
          id: 's1',
          action: 'dispatch.status_change',
          metadata: { from: 'ASSIGNED', to: 'EN_ROUTE_TO_PICKUP' },
        }),
        audit({
          id: 's2',
          action: 'dispatch.status_change',
          createdAt: '2026-07-29T09:01:00.000Z',
          metadata: { from: 'DRAFT', to: 'ASSIGNED' },
        }),
      ],
    });
    expect(events.every((e) => e.kind === 'status')).toBe(true);
  });

  it('groups schedule changes and nets reverse diffs to one direction', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: baseDispatch,
      dispatchAuditLogs: [
        audit({
          id: 'sch-1',
          action: 'dispatch.schedule_changed',
          createdAt: '2026-07-29T09:30:00.000Z',
          metadata: {
            from: {
              pickupDateScheduled: '2026-07-29T03:19:00.000Z',
              deliveryDateScheduled: '2026-07-29T09:00:00.000Z',
            },
            to: {
              pickupDateScheduled: '2026-07-29T01:19:00.000Z',
              deliveryDateScheduled: '2026-07-29T09:00:00.000Z',
            },
          },
        }),
        audit({
          id: 'sch-2',
          action: 'dispatch.schedule_changed',
          createdAt: '2026-07-29T09:30:20.000Z',
          metadata: {
            from: {
              pickupDateScheduled: '2026-07-29T01:19:00.000Z',
              deliveryDateScheduled: '2026-07-29T09:00:00.000Z',
            },
            to: {
              pickupDateScheduled: '2026-07-29T03:19:00.000Z',
              deliveryDateScheduled: '2026-07-29T10:30:00.000Z',
            },
          },
        }),
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Schedule changed');
    expect(events[0].groupedCount).toBe(2);
    // Pickup 03:19→01:19→03:19 nets to no-op; Delivery 09:00→10:30 remains.
    expect(events[0].diffs?.map((d) => d.label)).toEqual(['Delivery']);
    expect(events[0].diffs?.[0]?.from).not.toBe(events[0].diffs?.[0]?.to);
  });

  it('does not put Dispatch updated under Notes filter', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: baseDispatch,
      dispatchAuditLogs: [
        audit({
          id: 'u1',
          action: 'dispatch.update',
          metadata: { changes: { notes: 'Hello' } },
        }),
        audit({
          id: 'u2',
          action: 'dispatch.schedule_changed',
          createdAt: '2026-07-29T09:05:00.000Z',
          metadata: {
            from: {
              pickupDateScheduled: '2026-07-29T08:00:00.000Z',
              deliveryDateScheduled: '2026-07-29T18:00:00.000Z',
            },
            to: {
              pickupDateScheduled: '2026-07-29T09:00:00.000Z',
              deliveryDateScheduled: '2026-07-29T18:00:00.000Z',
            },
          },
        }),
      ],
    });
    const notesOnly = filterTimelineEvents(events, 'notes', '');
    expect(notesOnly.every((e) => e.kind === 'note')).toBe(true);
    expect(notesOnly.some((e) => e.title === 'Dispatch updated')).toBe(false);
    expect(notesOnly.some((e) => e.title === 'Schedule changed')).toBe(false);
  });

  it('keeps status events chronological newest-first', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: baseDispatch,
      dispatchAuditLogs: [
        audit({
          id: 'a',
          action: 'dispatch.status_change',
          createdAt: '2026-07-29T10:00:00.000Z',
          metadata: { from: 'ASSIGNED', to: 'EN_ROUTE_TO_PICKUP' },
        }),
        audit({
          id: 'b',
          action: 'dispatch.status_change',
          createdAt: '2026-07-29T09:00:00.000Z',
          metadata: { from: 'DRAFT', to: 'ASSIGNED' },
        }),
        audit({
          id: 'c',
          action: 'dispatch.status_change',
          createdAt: '2026-07-29T11:00:00.000Z',
          metadata: { from: 'EN_ROUTE_TO_PICKUP', to: 'AT_PICKUP' },
        }),
      ],
    });
    expect(events.map((e) => e.title)).toEqual([
      'Arrived at pickup',
      'En route to pickup',
      'Assigned',
    ]);
  });

  it('skips statusHistory when audit status events exist (no interleaving)', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: {
        ...baseDispatch,
        statusHistory: [
          { id: 'h1', status: 'DRAFT', createdAt: '2026-07-29T12:00:00.000Z' },
          { id: 'h2', status: 'ASSIGNED', createdAt: '2026-07-29T09:00:00.000Z' },
          { id: 'h3', status: 'EN_ROUTE_TO_PICKUP', createdAt: '2026-07-29T10:00:00.000Z' },
          { id: 'h4', status: 'AT_PICKUP', createdAt: '2026-07-29T08:00:00.000Z' },
        ],
      },
      dispatchAuditLogs: [
        audit({
          id: 's1',
          action: 'dispatch.status_change',
          createdAt: '2026-07-29T10:00:00.000Z',
          metadata: { from: 'ASSIGNED', to: 'EN_ROUTE_TO_PICKUP' },
        }),
      ],
    });
    expect(events.every((e) => !e.id.startsWith('sh-'))).toBe(true);
    expect(events).toHaveLength(1);
  });

  it('emits unique event ids', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: baseDispatch,
      dispatchAuditLogs: [
        audit({ id: 'dup', action: 'dispatch.create' }),
        audit({ id: 'dup', action: 'dispatch.create', createdAt: '2026-07-29T09:01:00.000Z' }),
      ],
    });
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes order document upload in documents category', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: baseDispatch,
      dispatchAuditLogs: [],
      orderAuditLogs: [
        audit({
          action: 'order.document.upload',
          entityType: 'Order',
          metadata: { fileName: 'pod.pdf', documentType: 'POD' },
        }),
      ],
    });
    expect(events[0].title).toBe('Document uploaded');
    expect(events[0].categories).toContain('documents');
  });
});

describe('netFieldDiffs', () => {
  it('collapses reverse pickup changes into net empty', () => {
    const events: OperationalTimelineEvent[] = [
      {
        id: '2',
        at: '2026-07-29T09:30:20.000Z',
        title: 'Schedule changed',
        kind: 'schedule',
        categories: [],
        searchText: '',
        diffs: [{ label: 'Pickup', from: '01:19', to: '03:19' }],
      },
      {
        id: '1',
        at: '2026-07-29T09:30:00.000Z',
        title: 'Schedule changed',
        kind: 'schedule',
        categories: [],
        searchText: '',
        diffs: [{ label: 'Pickup', from: '03:19', to: '01:19' }],
      },
    ];
    expect(netFieldDiffs(events)).toEqual([]);
  });
});

describe('sortTimelineEventsDesc', () => {
  it('uses sequence when timestamps tie', () => {
    const sorted = sortTimelineEventsDesc([
      {
        id: '1',
        at: '2026-07-29T09:00:00.000Z',
        title: 'Draft',
        kind: 'status',
        categories: ['status'],
        searchText: '',
        sequence: 0,
      },
      {
        id: '2',
        at: '2026-07-29T09:00:00.000Z',
        title: 'Assigned',
        kind: 'status',
        categories: ['status'],
        searchText: '',
        sequence: 1,
      },
    ]);
    expect(sorted.map((e) => e.title)).toEqual(['Assigned', 'Draft']);
  });
});

describe('filterTimelineEvents', () => {
  it('filters by status category', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: baseDispatch,
      dispatchAuditLogs: [
        audit({
          id: 'status-1',
          action: 'dispatch.status_change',
          metadata: { from: 'AT_PICKUP', to: 'IN_TRANSIT' },
        }),
      ],
      invoiceAuditLogs: [
        audit({
          id: 'invoice-1',
          action: 'invoice.create_from_order',
          entityType: 'Invoice',
          metadata: { invoiceNumber: 'INV-1' },
        }),
      ],
    });
    const filtered = filterTimelineEvents(events, 'status', '');
    expect(filtered.every((e) => e.categories.includes('status'))).toBe(true);
  });

  it('filters by search query', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: baseDispatch,
      dispatchAuditLogs: [
        audit({
          id: 'status-1',
          action: 'dispatch.status_change',
          metadata: { from: 'AT_PICKUP', to: 'IN_TRANSIT' },
        }),
      ],
      invoiceAuditLogs: [
        audit({
          id: 'invoice-1',
          action: 'invoice.create_from_order',
          entityType: 'Invoice',
          metadata: { invoiceNumber: 'INV-1' },
        }),
      ],
    });
    const filtered = filterTimelineEvents(events, 'all', 'invoice');
    expect(filtered.some((e) => e.title.toLowerCase().includes('invoice'))).toBe(true);
  });

  it('maps dispatch.delivery_failed to a cancel-kind event with reason and notes', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: { ...baseDispatch, status: 'DELIVERY_FAILED' as const },
      dispatchAuditLogs: [
        audit({
          action: 'dispatch.delivery_failed',
          metadata: {
            reason: 'CUSTOMER_UNAVAILABLE',
            notes: 'No answer after three knocks',
            dispatchNumber: 'DSP-001',
          },
        }),
      ],
    });
    expect(events[0].title).toBe('Delivery failed');
    expect(events[0].kind).toBe('cancel');
    expect(events[0].subtitle).toBe('Customer unavailable');
    expect(events[0].detail).toBe('No answer after three knocks');
    expect(events[0].categories).toContain('status');
  });

  it('maps dispatch.conflict_detected audit metadata to timeline events', () => {
    const events = buildDispatchOperationalTimeline({
      dispatch: baseDispatch,
      dispatchAuditLogs: [
        audit({
          action: 'dispatch.conflict_detected',
          metadata: {
            dispatchId: 'dispatch-1',
            count: 2,
            highestSeverity: 'critical',
            types: ['schedule.late_pickup', 'vehicle.inspection_expired'],
          },
        }),
      ],
    });

    expect(events[0].title).toBe('Conflict detected');
    expect(events[0].kind).toBe('conflict');
    expect(events[0].subtitle).toBe('schedule.late_pickup, vehicle.inspection_expired');
    expect(events[0].detail).toBe('2 new conflicts · critical');
  });
});
