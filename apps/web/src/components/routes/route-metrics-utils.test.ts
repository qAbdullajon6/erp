import { describe, it, expect } from 'vitest';
import { countStopsMissingCoordinates, formatETA } from './route-metrics-utils';
import type { ApiRouteStop } from '@/lib/api/routes';

function makeStop(overrides: Partial<ApiRouteStop> = {}): ApiRouteStop {
  return {
    id: 'stop-1',
    sequence: 1,
    orderId: null,
    dispatchId: null,
    label: null,
    address: '123 Main St',
    city: 'Testville',
    lat: '40.7128',
    lng: '-74.0060',
    plannedArrival: null,
    plannedDeparture: null,
    distanceFromPrevM: null,
    durationFromPrevSec: null,
    status: 'PENDING',
    optimizationLocked: false,
    notes: null,
    order: null,
    dispatch: null,
    ...overrides,
  };
}

describe('countStopsMissingCoordinates', () => {
  it('returns 0 when all stops have coordinates', () => {
    const stops = [makeStop({ lat: '10', lng: '20' }), makeStop({ lat: '30', lng: '40' })];
    expect(countStopsMissingCoordinates(stops)).toBe(0);
  });

  it('counts stops with null lat', () => {
    const stops = [makeStop({ lat: null }), makeStop({ lat: '10', lng: '20' })];
    expect(countStopsMissingCoordinates(stops)).toBe(1);
  });

  it('counts stops with null lng', () => {
    const stops = [makeStop({ lng: null }), makeStop({ lat: '10', lng: '20' })];
    expect(countStopsMissingCoordinates(stops)).toBe(1);
  });

  it('counts stops with both null', () => {
    const stops = [makeStop({ lat: null, lng: null }), makeStop({ lat: null, lng: null })];
    expect(countStopsMissingCoordinates(stops)).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(countStopsMissingCoordinates([])).toBe(0);
  });
});

describe('formatETA', () => {
  it('returns — for null', () => {
    expect(formatETA(null)).toBe('—');
  });

  it('returns — for undefined', () => {
    expect(formatETA(undefined)).toBe('—');
  });

  it('returns — for invalid date string', () => {
    expect(formatETA('not-a-date')).toBe('—');
  });

  it('returns a time string for a valid ISO date', () => {
    const result = formatETA('2026-08-22T09:30:00.000Z');
    // Should be a time formatted string (HH:MM), exact value depends on timezone
    expect(result).toMatch(/^\d{1,2}:\d{2}(\s?(AM|PM))?$/i);
  });
});
