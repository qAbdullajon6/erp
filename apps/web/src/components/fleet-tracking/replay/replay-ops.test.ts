import { describe, expect, it } from 'vitest';
import type {
  GeofenceEventItem,
  TelematicsTrip,
  TripReplayPoint,
} from '@/lib/api/telematics';
import {
  buildReplayEvents,
  findPointIndexAt,
  formatReplayElapsed,
  replayBounds,
} from './replay-ops';

const trip = {
  id: 'trip-1',
  status: 'COMPLETED',
  startedAt: '2026-07-26T10:00:00.000Z',
  endedAt: '2026-07-26T10:10:00.000Z',
} as TelematicsTrip;

const points: TripReplayPoint[] = [
  {
    at: '2026-07-26T10:00:05.000Z',
    lat: 1,
    lng: 2,
    speedKph: 0,
    heading: null,
    movementState: 'STOPPED',
  },
  {
    at: '2026-07-26T10:00:15.000Z',
    lat: 1.1,
    lng: 2.1,
    speedKph: 30,
    heading: 90,
    movementState: 'MOVING',
  },
  {
    at: '2026-07-26T10:05:00.000Z',
    lat: 1.2,
    lng: 2.2,
    speedKph: 0,
    heading: 90,
    movementState: 'IDLING',
  },
];

describe('trip replay helpers', () => {
  it('uses recorded-point timestamps as replay bounds', () => {
    expect(replayBounds(trip, points)).toEqual({
      startMs: Date.parse(points[0].at),
      endMs: Date.parse(points[2].at),
      durationMs: 295_000,
    });
  });

  it('holds the last real fix through a GPS gap instead of interpolating', () => {
    expect(findPointIndexAt(points, Date.parse('2026-07-26T10:03:00.000Z'))).toBe(1);
  });

  it('emits recorded movement, geofence, and trip boundary events', () => {
    const geofence = {
      id: 'event-1',
      tripId: trip.id,
      type: 'ENTER',
      occurredAt: '2026-07-26T10:03:00.000Z',
    } as GeofenceEventItem;

    expect(
      buildReplayEvents(trip, points, [geofence]).map((event) => event.label),
    ).toEqual([
      'Trip started',
      'Stopped',
      'Movement',
      'Geofence entered',
      'Idle',
      'Trip completed',
    ]);
  });

  it('formats elapsed playback time', () => {
    expect(formatReplayElapsed(65_000)).toBe('1:05');
    expect(formatReplayElapsed(3_665_000)).toBe('1:01:05');
  });
});
