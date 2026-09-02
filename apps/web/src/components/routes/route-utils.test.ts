import { describe, it, expect } from 'vitest';
import {
  formatRouteDistance,
  formatRouteDuration,
  ROUTE_STATUS_LABELS,
  ROUTE_STATUS_COLORS,
  STOP_STATUS_LABELS,
} from './route-utils';
import type { RouteStatus, RouteStopStatus } from '@/lib/api/routes';

// ─── formatRouteDistance ─────────────────────────────────────────────────────

describe('formatRouteDistance', () => {
  it('returns em-dash for null', () => {
    expect(formatRouteDistance(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(formatRouteDistance(undefined)).toBe('—');
  });

  it('shows metres when < 1000 m', () => {
    expect(formatRouteDistance(0)).toBe('0 m');
    expect(formatRouteDistance(500)).toBe('500 m');
    expect(formatRouteDistance(999)).toBe('999 m');
  });

  it('converts to km at exactly 1000 m', () => {
    expect(formatRouteDistance(1000)).toBe('1.0 km');
  });

  it('formats km with one decimal place', () => {
    expect(formatRouteDistance(1500)).toBe('1.5 km');
    expect(formatRouteDistance(12345)).toBe('12.3 km');
    expect(formatRouteDistance(100000)).toBe('100.0 km');
  });
});

// ─── formatRouteDuration ─────────────────────────────────────────────────────

describe('formatRouteDuration', () => {
  it('returns em-dash for null', () => {
    expect(formatRouteDuration(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(formatRouteDuration(undefined)).toBe('—');
  });

  it('shows only minutes when < 1 hour', () => {
    expect(formatRouteDuration(0)).toBe('0m');
    expect(formatRouteDuration(60)).toBe('1m');
    expect(formatRouteDuration(3540)).toBe('59m');
  });

  it('shows hours and minutes at exactly 1 hour', () => {
    expect(formatRouteDuration(3600)).toBe('1h 0m');
  });

  it('shows hours and minutes for longer durations', () => {
    expect(formatRouteDuration(3660)).toBe('1h 1m');
    expect(formatRouteDuration(7200)).toBe('2h 0m');
    expect(formatRouteDuration(9000)).toBe('2h 30m');
  });
});

// ─── ROUTE_STATUS_LABELS ─────────────────────────────────────────────────────

describe('ROUTE_STATUS_LABELS', () => {
  const statuses: RouteStatus[] = ['DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

  it('has a label for every route status', () => {
    for (const s of statuses) {
      expect(ROUTE_STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it('returns human-readable strings', () => {
    expect(ROUTE_STATUS_LABELS.DRAFT).toBe('Draft');
    expect(ROUTE_STATUS_LABELS.IN_PROGRESS).toBe('In Progress');
    expect(ROUTE_STATUS_LABELS.COMPLETED).toBe('Completed');
    expect(ROUTE_STATUS_LABELS.CANCELLED).toBe('Cancelled');
  });
});

// ─── ROUTE_STATUS_COLORS ─────────────────────────────────────────────────────

describe('ROUTE_STATUS_COLORS', () => {
  const statuses: RouteStatus[] = ['DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

  it('has a colour string for every route status', () => {
    for (const s of statuses) {
      expect(typeof ROUTE_STATUS_COLORS[s]).toBe('string');
      expect(ROUTE_STATUS_COLORS[s].length).toBeGreaterThan(0);
    }
  });

  it('COMPLETED uses success tone', () => {
    expect(ROUTE_STATUS_COLORS.COMPLETED).toContain('success');
  });

  it('CANCELLED uses destructive tone', () => {
    expect(ROUTE_STATUS_COLORS.CANCELLED).toContain('destructive');
  });
});

// ─── STOP_STATUS_LABELS ──────────────────────────────────────────────────────

describe('STOP_STATUS_LABELS', () => {
  const stopStatuses: RouteStopStatus[] = ['PENDING', 'COMPLETED', 'SKIPPED'];

  it('has a label for every stop status', () => {
    for (const s of stopStatuses) {
      expect(STOP_STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it('PENDING maps to Pending', () => {
    expect(STOP_STATUS_LABELS.PENDING).toBe('Pending');
  });

  it('COMPLETED maps to Done', () => {
    expect(STOP_STATUS_LABELS.COMPLETED).toBe('Done');
  });
});
