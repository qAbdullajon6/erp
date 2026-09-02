import { describe, expect, it } from 'vitest';
import { findNavigationTargetStop, getCurrentDispatchStop } from './stop-nav';

const base = {
  address: '1 Main St',
  city: 'Springfield',
  lat: '37.0',
  lng: '-122.0',
};

function makeStop(
  overrides: Partial<{
    stopType: string;
    arrivedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
  }>,
) {
  return {
    stopType: 'INTERMEDIATE',
    arrivedAt: null,
    completedAt: null,
    failedAt: null,
    ...base,
    ...overrides,
  };
}

describe('findNavigationTargetStop', () => {
  describe('non-relevant statuses', () => {
    it('returns null for ASSIGNED', () => {
      const stops = [makeStop({})];
      expect(findNavigationTargetStop('ASSIGNED', stops)).toBeNull();
    });

    it('returns null for EN_ROUTE_TO_PICKUP', () => {
      expect(findNavigationTargetStop('EN_ROUTE_TO_PICKUP', [makeStop({})])).toBeNull();
    });

    it('returns null for DELIVERED', () => {
      expect(findNavigationTargetStop('DELIVERED', [makeStop({})])).toBeNull();
    });

    it('returns null for empty stops at IN_TRANSIT', () => {
      expect(findNavigationTargetStop('IN_TRANSIT', [])).toBeNull();
    });
  });

  describe('AT_STOP — returns the active stop', () => {
    it('returns stop that has arrivedAt but no completedAt or failedAt', () => {
      const active = makeStop({ arrivedAt: '2024-01-01T10:00:00Z' });
      const stops = [active];
      expect(findNavigationTargetStop('AT_STOP', stops)).toBe(active);
    });

    it('ignores stops that are completed', () => {
      const completed = makeStop({ arrivedAt: '2024-01-01T09:00:00Z', completedAt: '2024-01-01T09:30:00Z' });
      const active = makeStop({ arrivedAt: '2024-01-01T10:00:00Z' });
      expect(findNavigationTargetStop('AT_STOP', [completed, active])).toBe(active);
    });

    it('ignores stops that have failedAt', () => {
      const failed = makeStop({ arrivedAt: '2024-01-01T09:00:00Z', failedAt: '2024-01-01T09:30:00Z' });
      const active = makeStop({ arrivedAt: '2024-01-01T10:00:00Z' });
      expect(findNavigationTargetStop('AT_STOP', [failed, active])).toBe(active);
    });

    it('returns null when no stop is active (all completed)', () => {
      const completed = makeStop({ arrivedAt: '2024-01-01T09:00:00Z', completedAt: '2024-01-01T09:30:00Z' });
      expect(findNavigationTargetStop('AT_STOP', [completed])).toBeNull();
    });

    it('ignores PICKUP and DELIVERY stop types', () => {
      const pickup = makeStop({ stopType: 'PICKUP', arrivedAt: '2024-01-01T09:00:00Z' });
      const delivery = makeStop({ stopType: 'DELIVERY', arrivedAt: '2024-01-01T09:00:00Z' });
      expect(findNavigationTargetStop('AT_STOP', [pickup, delivery])).toBeNull();
    });
  });

  describe('IN_TRANSIT — returns first unvisited non-failed stop', () => {
    it('returns first stop with no arrivedAt and no failedAt', () => {
      const upcoming = makeStop({});
      expect(findNavigationTargetStop('IN_TRANSIT', [upcoming])).toBe(upcoming);
    });

    it('skips stops that already have arrivedAt', () => {
      const visited = makeStop({ arrivedAt: '2024-01-01T09:00:00Z', completedAt: '2024-01-01T09:30:00Z' });
      const upcoming = makeStop({});
      expect(findNavigationTargetStop('IN_TRANSIT', [visited, upcoming])).toBe(upcoming);
    });

    it('skips failed stops and returns the next unvisited one', () => {
      const failed = makeStop({ arrivedAt: '2024-01-01T09:00:00Z', failedAt: '2024-01-01T09:30:00Z' });
      const upcoming = makeStop({});
      expect(findNavigationTargetStop('IN_TRANSIT', [failed, upcoming])).toBe(upcoming);
    });

    it('returns null when all stops are visited or failed', () => {
      const visited = makeStop({ arrivedAt: '2024-01-01T09:00:00Z', completedAt: '2024-01-01T09:30:00Z' });
      const failed = makeStop({ arrivedAt: '2024-01-01T10:00:00Z', failedAt: '2024-01-01T10:30:00Z' });
      expect(findNavigationTargetStop('IN_TRANSIT', [visited, failed])).toBeNull();
    });

    it('returns null for PICKUP/DELIVERY types even if unvisited', () => {
      const pickup = makeStop({ stopType: 'PICKUP' });
      const delivery = makeStop({ stopType: 'DELIVERY' });
      expect(findNavigationTargetStop('IN_TRANSIT', [pickup, delivery])).toBeNull();
    });
  });
});

// A helper that adds stopType so we can build DELIVERY stops easily
function makeTypedStop(
  stopType: string,
  overrides: Partial<{ arrivedAt: string | null; completedAt: string | null; failedAt: string | null }> = {},
) {
  return { ...makeStop({ stopType, ...overrides }), stopType };
}

describe('getCurrentDispatchStop', () => {
  // A: AT_STOP → active INTERMEDIATE stop
  describe('A — AT_STOP returns the active intermediate stop', () => {
    it('returns the stop that has arrivedAt but not completedAt or failedAt', () => {
      const active = makeTypedStop('INTERMEDIATE', { arrivedAt: '2024-01-01T10:00:00Z' });
      expect(getCurrentDispatchStop('AT_STOP', [active])).toBe(active);
    });

    it('ignores completed intermediate stops', () => {
      const done = makeTypedStop('INTERMEDIATE', {
        arrivedAt: '2024-01-01T09:00:00Z',
        completedAt: '2024-01-01T09:30:00Z',
      });
      expect(getCurrentDispatchStop('AT_STOP', [done])).toBeNull();
    });

    it('ignores failed intermediate stops', () => {
      const failed = makeTypedStop('INTERMEDIATE', {
        arrivedAt: '2024-01-01T09:00:00Z',
        failedAt: '2024-01-01T09:30:00Z',
      });
      expect(getCurrentDispatchStop('AT_STOP', [failed])).toBeNull();
    });
  });

  // B: IN_TRANSIT → first unvisited INTERMEDIATE, falling back to DELIVERY
  describe('B — IN_TRANSIT returns next intermediate or delivery', () => {
    it('returns first unvisited non-failed intermediate', () => {
      const next = makeTypedStop('INTERMEDIATE');
      const delivery = makeTypedStop('DELIVERY');
      expect(getCurrentDispatchStop('IN_TRANSIT', [next, delivery])).toBe(next);
    });

    it('falls back to DELIVERY when all intermediates are visited', () => {
      const visited = makeTypedStop('INTERMEDIATE', {
        arrivedAt: '2024-01-01T09:00:00Z',
        completedAt: '2024-01-01T09:30:00Z',
      });
      const delivery = makeTypedStop('DELIVERY');
      expect(getCurrentDispatchStop('IN_TRANSIT', [visited, delivery])).toBe(delivery);
    });

    it('skips failed intermediates and falls back to DELIVERY', () => {
      const failed = makeTypedStop('INTERMEDIATE', {
        arrivedAt: '2024-01-01T09:00:00Z',
        failedAt: '2024-01-01T09:30:00Z',
      });
      const delivery = makeTypedStop('DELIVERY');
      expect(getCurrentDispatchStop('IN_TRANSIT', [failed, delivery])).toBe(delivery);
    });

    it('returns null when there are no stops at all', () => {
      expect(getCurrentDispatchStop('IN_TRANSIT', [])).toBeNull();
    });
  });

  // C: ARRIVED_AT_DELIVERY / DELIVERED → DELIVERY stop
  describe('C — ARRIVED_AT_DELIVERY / DELIVERED returns the delivery stop', () => {
    it('returns DELIVERY for ARRIVED_AT_DELIVERY', () => {
      const delivery = makeTypedStop('DELIVERY', { arrivedAt: '2024-01-01T12:00:00Z' });
      expect(getCurrentDispatchStop('ARRIVED_AT_DELIVERY', [delivery])).toBe(delivery);
    });

    it('returns DELIVERY for DELIVERED', () => {
      const delivery = makeTypedStop('DELIVERY', {
        arrivedAt: '2024-01-01T12:00:00Z',
        completedAt: '2024-01-01T12:30:00Z',
      });
      expect(getCurrentDispatchStop('DELIVERED', [delivery])).toBe(delivery);
    });
  });

  // D: other statuses → null
  describe('D — other statuses return null', () => {
    it('returns null for ASSIGNED', () => {
      expect(getCurrentDispatchStop('ASSIGNED', [makeTypedStop('INTERMEDIATE')])).toBeNull();
    });

    it('returns null for EN_ROUTE_TO_PICKUP', () => {
      expect(getCurrentDispatchStop('EN_ROUTE_TO_PICKUP', [makeTypedStop('INTERMEDIATE')])).toBeNull();
    });

    it('returns null for AT_PICKUP', () => {
      expect(getCurrentDispatchStop('AT_PICKUP', [makeTypedStop('INTERMEDIATE')])).toBeNull();
    });
  });
});
