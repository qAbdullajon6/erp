'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/shared/list-states';
import { WorkspaceHeader } from '@/components/shared/page-header';
import {
  useGeofenceEventsQuery,
  useTelematicsTripQuery,
  useTripReplayQuery,
} from '@/lib/api/telematics';
import { TripReplayMap } from './trip-replay-map';
import { TripReplayControls } from './trip-replay-controls';
import { TripReplaySummary } from './trip-replay-summary';
import { ReplayEventList } from './replay-event-list';
import {
  buildReplayEvents,
  findPointIndexAt,
  replayBounds,
} from './replay-ops';
import { ArrowLeft, MapPin, RefreshCw, TriangleAlert } from 'lucide-react';

interface Props {
  tripId: string;
}

export function TripReplayWorkspace({ tripId }: Props) {
  const tripQuery = useTelematicsTripQuery(tripId);
  const replayQuery = useTripReplayQuery(tripId, { limit: 10_000 });

  const trip = tripQuery.data ?? null;
  const geofenceQuery = useGeofenceEventsQuery(
    {
      vehicleId: trip?.vehicleId,
      from: trip?.startedAt,
      to: trip?.endedAt ?? undefined,
      limit: 100,
    },
    { enabled: !!trip },
  );
  const points = useMemo(
    () => replayQuery.data?.points ?? [],
    [replayQuery.data?.points],
  );
  const bounds = useMemo(
    () => (trip ? replayBounds(trip, points) : null),
    [trip, points],
  );
  const events = useMemo(
    () =>
      trip
        ? buildReplayEvents(
            trip,
            points,
            (geofenceQuery.data?.items ?? []).filter(
              (event) => event.tripId === trip.id,
            ),
          )
        : [],
    [trip, points, geofenceQuery.data?.items],
  );

  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const lastFrameRef = useRef<number | null>(null);
  const lastPaintRef = useRef(0);
  const accumulatedMsRef = useRef(0);

  useEffect(() => {
    if (!bounds) return;
    setPlayheadMs(bounds.startMs);
    setPlaying(false);
  }, [tripId, bounds]);

  const seek = useCallback(
    (nextMs: number) => {
      if (!bounds) return;
      setPlayheadMs(Math.min(bounds.endMs, Math.max(bounds.startMs, nextMs)));
    },
    [bounds],
  );

  const togglePlay = useCallback(() => {
    if (!bounds || bounds.durationMs <= 0) return;
    setPlaying((current) => {
      if (!current && playheadMs >= bounds.endMs) {
        setPlayheadMs(bounds.startMs);
      }
      return !current;
    });
  }, [bounds, playheadMs]);

  const stop = useCallback(() => {
    if (!bounds) return;
    setPlaying(false);
    setPlayheadMs(bounds.startMs);
  }, [bounds]);

  const restart = useCallback(() => {
    if (!bounds || bounds.durationMs <= 0) return;
    setPlayheadMs(bounds.startMs);
    setPlaying(true);
  }, [bounds]);

  useEffect(() => {
    if (!playing || !bounds) {
      lastFrameRef.current = null;
      accumulatedMsRef.current = 0;
      return;
    }

    let frameId = 0;
    const frame = (now: number) => {
      const previous = lastFrameRef.current ?? now;
      const delta = Math.min(250, now - previous);
      lastFrameRef.current = now;
      accumulatedMsRef.current += delta;

      // Throttle React paints to ~20 fps. The playhead still uses real elapsed
      // time, and the map only moves when a recorded point timestamp is crossed.
      if (now - lastPaintRef.current >= 50) {
        lastPaintRef.current = now;
        const elapsed = accumulatedMsRef.current;
        accumulatedMsRef.current = 0;
        setPlayheadMs((current) => {
          const next = Math.min(bounds.endMs, current + elapsed * speed);
          if (next >= bounds.endMs) setPlaying(false);
          return next;
        });
      }
      frameId = requestAnimationFrame(frame);
    };

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [playing, speed, bounds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (
        target?.isContentEditable ||
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        tag === 'button'
      ) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seek(playheadMs - 10_000);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seek(playheadMs + 10_000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playheadMs, seek, togglePlay]);

  const loading = tripQuery.isLoading || replayQuery.isLoading;
  const failed = tripQuery.isError || replayQuery.isError;

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <LoadingState label="Loading recorded trip positions…" />
      </div>
    );
  }

  if (failed || !trip) {
    return (
      <div className="p-6">
        <ErrorState
          message={
            tripQuery.errorMessage ??
            replayQuery.errorMessage ??
            'Trip replay could not be loaded.'
          }
          onRetry={() => {
            void tripQuery.refetch();
            void replayQuery.refetch();
          }}
        />
      </div>
    );
  }

  if (points.length === 0 || !bounds) {
    return (
      <div className="p-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/app/fleet-tracking">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Fleet Tracking
          </Link>
        </Button>
        <EmptyState
          icon={MapPin}
          title="Replay unavailable"
          description="This trip has no recorded GPS positions. Replay never fabricates coordinates."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void replayQuery.refetch()}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const pointIndex = findPointIndexAt(points, playheadMs);
  const currentPoint = points[Math.max(0, pointIndex)];
  const truncated = trip.pointCount > points.length;

  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] flex-col bg-background lg:h-[calc(100vh-4rem)] lg:min-h-0"
      data-testid="trip-replay-workspace"
    >
      <WorkspaceHeader
        title="Trip Replay"
        icon={
          <Button asChild variant="ghost" size="icon" className="-ml-2 h-8 w-8">
            <Link to="/app/fleet-tracking" aria-label="Back to Fleet Tracking">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        }
        subtitle={
          <span className="font-mono">{trip.id} · recorded fixes only</span>
        }
        action={
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{points.length.toLocaleString()} positions</span>
            <span aria-hidden>·</span>
            <span>{trip.status}</span>
          </span>
        }
      >
        {truncated ? (
          <div
            className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning"
            role="status"
          >
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Showing the first {points.length.toLocaleString()} of{' '}
              {trip.pointCount.toLocaleString()} recorded positions. The existing
              replay endpoint is capped at 10,000 points.
            </span>
          </div>
        ) : null}
      </WorkspaceHeader>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="flex min-h-[32rem] min-w-0 flex-col border-r border-border/60 lg:min-h-0">
          <div className="relative min-h-[22rem] flex-1 overflow-hidden bg-muted/20">
            <TripReplayMap points={points} currentPoint={currentPoint} />
            <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border/60 bg-surface/90 px-2.5 py-1.5 text-[10px] text-muted-foreground shadow backdrop-blur">
              Position {pointIndex + 1} of {points.length.toLocaleString()} · GPS
              gaps are preserved
            </div>
          </div>
          <TripReplayControls
            playing={playing}
            playheadMs={playheadMs}
            startMs={bounds.startMs}
            endMs={bounds.endMs}
            speed={speed}
            events={events}
            onTogglePlay={togglePlay}
            onStop={stop}
            onRestart={restart}
            onSeek={seek}
            onSpeedChange={setSpeed}
          />
        </main>

        <aside className="min-h-0 overflow-y-auto bg-muted/10 p-3">
          <div className="space-y-4">
            <TripReplaySummary
              trip={trip}
              currentPoint={currentPoint}
              returnedPointCount={points.length}
            />
            <ReplayEventList
              events={events}
              playheadMs={playheadMs}
              onSeek={seek}
              errorMessage={geofenceQuery.errorMessage}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
