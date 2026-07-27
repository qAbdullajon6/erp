import type {
  GeofenceEventItem,
  MovementState,
  TelematicsTrip,
  TripReplayPoint,
} from '@/lib/api/telematics';

export type ReplayEventKind =
  | 'trip-started'
  | 'movement'
  | 'geofence'
  | 'trip-completed';

export interface ReplayEvent {
  id: string;
  at: string;
  kind: ReplayEventKind;
  label: string;
  pointIndex: number;
  movementState?: MovementState;
}

export function replayBounds(
  trip: TelematicsTrip,
  points: TripReplayPoint[],
): { startMs: number; endMs: number; durationMs: number } {
  const tripStart = Date.parse(trip.startedAt);
  const tripEnd = trip.endedAt ? Date.parse(trip.endedAt) : Number.NaN;
  const firstPoint = points.length > 0 ? Date.parse(points[0].at) : Number.NaN;
  const lastPoint =
    points.length > 0 ? Date.parse(points[points.length - 1].at) : Number.NaN;

  const startMs = Number.isFinite(firstPoint) ? firstPoint : tripStart;
  const endMs = Number.isFinite(lastPoint)
    ? lastPoint
    : Number.isFinite(tripEnd)
      ? tripEnd
      : startMs;

  return {
    startMs,
    endMs: Math.max(startMs, endMs),
    durationMs: Math.max(0, endMs - startMs),
  };
}

/// Returns the last recorded point at or before the playhead. Playback jumps
/// between real fixes; it never interpolates a coordinate across a GPS gap.
export function findPointIndexAt(
  points: TripReplayPoint[],
  playheadMs: number,
): number {
  if (points.length === 0) return -1;
  if (playheadMs <= Date.parse(points[0].at)) return 0;

  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (Date.parse(points[mid].at) <= playheadMs) low = mid + 1;
    else high = mid - 1;
  }
  return Math.max(0, Math.min(points.length - 1, high));
}

export function buildReplayEvents(
  trip: TelematicsTrip,
  points: TripReplayPoint[],
  geofenceEvents: GeofenceEventItem[] = [],
): ReplayEvent[] {
  if (points.length === 0) return [];

  const events: ReplayEvent[] = [
    {
      id: 'trip-started',
      at: trip.startedAt,
      kind: 'trip-started',
      label: 'Trip started',
      pointIndex: 0,
    },
  ];

  let previousState = points[0].movementState;
  events.push({
    id: `movement-0-${previousState}`,
    at: points[0].at,
    kind: 'movement',
    label: movementEventLabel(previousState),
    movementState: previousState,
    pointIndex: 0,
  });

  for (let index = 1; index < points.length; index += 1) {
    const state = points[index].movementState;
    if (state === previousState) continue;
    events.push({
      id: `movement-${index}-${state}`,
      at: points[index].at,
      kind: 'movement',
      label: movementEventLabel(state),
      movementState: state,
      pointIndex: index,
    });
    previousState = state;
  }

  for (const event of geofenceEvents) {
    const pointIndex = findPointIndexAt(points, Date.parse(event.occurredAt));
    events.push({
      id: `geofence-${event.id}`,
      at: event.occurredAt,
      kind: 'geofence',
      label:
        event.type === 'ENTER'
          ? 'Geofence entered'
          : event.type === 'EXIT'
            ? 'Geofence exited'
            : 'Geofence dwell',
      pointIndex: Math.max(0, pointIndex),
    });
  }

  if (trip.status === 'COMPLETED' && trip.endedAt) {
    events.push({
      id: 'trip-completed',
      at: trip.endedAt,
      kind: 'trip-completed',
      label: 'Trip completed',
      pointIndex: points.length - 1,
    });
  }

  return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function movementEventLabel(state: MovementState): string {
  switch (state) {
    case 'MOVING':
      return 'Movement';
    case 'IDLING':
      return 'Idle';
    case 'STOPPED':
      return 'Stopped';
    case 'OFFLINE':
      return 'Offline';
    case 'UNKNOWN':
      return 'Movement unknown';
  }
}

export function formatReplayElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}
