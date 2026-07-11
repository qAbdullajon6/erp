import { describe, expect, it } from 'vitest';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import { BOARD_COLUMNS, canDropInto, groupByStatus, isCancelDrop } from './board-columns';

/// Task 8.10 — the board's only logic, and the proof that it contains no rules.
///
/// Everything the board "decides" it is actually repeating: which column a card
/// sits in is `dispatch.status`, and where it may be dragged is
/// `dispatch.allowedTransitions`, both handed over by the API. These tests exist to
/// make it impossible to quietly reintroduce a transition table here — the fourth
/// copy of a backend rule, which is exactly what Task 8.10 set out to delete.

function dispatch(
  status: DispatchStatus,
  allowedTransitions: DispatchStatus[],
  id = `d-${status}`,
): ApiDispatch {
  return {
    id,
    organizationId: 'org',
    dispatchNumber: `DSP-${id}`,
    orderId: 'order-1',
    driverId: 'driver-1',
    vehicleId: 'vehicle-1',
    status,
    allowedTransitions,
    pickupDateScheduled: '2038-01-01T08:00:00.000Z',
    pickupDateActual: null,
    deliveryDateScheduled: '2038-01-03T18:00:00.000Z',
    deliveryDateActual: null,
    createdAt: '2038-01-01T00:00:00.000Z',
    updatedAt: '2038-01-01T00:00:00.000Z',
  } as ApiDispatch;
}

describe('columns', () => {
  it('has the seven dispatch states, in operational order', () => {
    expect(BOARD_COLUMNS.map((c) => c.status)).toEqual([
      'DRAFT',
      'ASSIGNED',
      'EN_ROUTE_TO_PICKUP',
      'AT_PICKUP',
      'IN_TRANSIT',
      'DELIVERED',
      'CANCELLED',
    ]);
  });

  it('places a card by its status and nothing else (R1)', () => {
    const columns = groupByStatus([
      dispatch('DRAFT', ['ASSIGNED'], 'a'),
      dispatch('IN_TRANSIT', ['DELIVERED', 'CANCELLED'], 'b'),
      dispatch('IN_TRANSIT', ['DELIVERED', 'CANCELLED'], 'c'),
    ]);

    expect(columns.DRAFT.map((d) => d.id)).toEqual(['a']);
    expect(columns.IN_TRANSIT.map((d) => d.id)).toEqual(['b', 'c']);
  });

  it('keeps every column present even when empty, so the board does not reflow', () => {
    const columns = groupByStatus([]);

    expect(Object.keys(columns)).toHaveLength(BOARD_COLUMNS.length);
    for (const column of BOARD_COLUMNS) {
      expect(columns[column.status]).toEqual([]);
    }
  });
});

describe('canDropInto — the answer is the SERVER’S', () => {
  it('allows exactly what allowedTransitions allows', () => {
    const assigned = dispatch('ASSIGNED', ['EN_ROUTE_TO_PICKUP', 'CANCELLED']);

    expect(canDropInto(assigned, 'EN_ROUTE_TO_PICKUP')).toBe(true);
    expect(canDropInto(assigned, 'CANCELLED')).toBe(true);
    expect(canDropInto(assigned, 'DELIVERED')).toBe(false);
    expect(canDropInto(assigned, 'AT_PICKUP')).toBe(false);
  });

  it('refuses everything for a terminal dispatch', () => {
    const delivered = dispatch('DELIVERED', []);

    for (const column of BOARD_COLUMNS) {
      expect(canDropInto(delivered, column.status)).toBe(false);
    }
  });

  it('refuses a drop back into the column the card came from', () => {
    const assigned = dispatch('ASSIGNED', ['EN_ROUTE_TO_PICKUP', 'CANCELLED']);

    expect(canDropInto(assigned, 'ASSIGNED')).toBe(false);
  });

  it('does NOT know the transition graph — it only reads the field', () => {
    // The real backend would never allow DRAFT -> DELIVERED. If this function had a
    // transition table of its own, it would say false. It has none: it believes the
    // server, whatever the server says. That is the whole point, and it is why a
    // change to R13 in the backend cannot leave the board behind.
    const liar = dispatch('DRAFT', ['DELIVERED']);

    expect(canDropInto(liar, 'DELIVERED')).toBe(true);
    expect(canDropInto(liar, 'ASSIGNED')).toBe(false);
  });
});

describe('cancellation is routed to its own endpoint', () => {
  it('recognises a drop onto the Cancelled column', () => {
    expect(isCancelDrop('CANCELLED')).toBe(true);
    expect(isCancelDrop('IN_TRANSIT')).toBe(false);
  });
});
