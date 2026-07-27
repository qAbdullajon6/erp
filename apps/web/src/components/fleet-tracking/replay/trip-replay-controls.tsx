'use client';

import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { formatDateTime } from '@/lib/format';
import type { ReplayEvent } from './replay-ops';
import { formatReplayElapsed } from './replay-ops';
import {
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  Square,
  StepBack,
  StepForward,
} from 'lucide-react';

const SPEEDS = [1, 2, 4, 8] as const;

interface Props {
  playing: boolean;
  playheadMs: number;
  startMs: number;
  endMs: number;
  speed: number;
  events: ReplayEvent[];
  onTogglePlay: () => void;
  onStop: () => void;
  onRestart: () => void;
  onSeek: (nextMs: number) => void;
  onSpeedChange: (speed: number) => void;
}

export const TripReplayControls = memo(function TripReplayControls({
  playing,
  playheadMs,
  startMs,
  endMs,
  speed,
  events,
  onTogglePlay,
  onStop,
  onRestart,
  onSeek,
  onSpeedChange,
}: Props) {
  const durationMs = Math.max(0, endMs - startMs);
  const elapsedMs = Math.max(0, playheadMs - startMs);
  const progress =
    durationMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / durationMs) * 100)) : 0;

  return (
    <section
      className="border-t border-border/70 bg-surface/95 px-3 py-3 backdrop-blur sm:px-4"
      aria-label="Trip replay controls"
    >
      <div className="relative mb-3 px-1">
        <Slider
          value={[playheadMs]}
          min={startMs}
          max={Math.max(startMs + 1, endMs)}
          step={1000}
          onValueChange={(value) => onSeek(value[0] ?? startMs)}
          aria-label="Replay timeline"
        />
        <div className="pointer-events-none absolute inset-x-1 top-1/2 h-0 -translate-y-1/2">
          {events.map((event) => {
            const eventMs = Date.parse(event.at);
            const left =
              durationMs > 0
                ? Math.min(
                    100,
                    Math.max(0, ((eventMs - startMs) / durationMs) * 100),
                  )
                : 0;
            return (
              <span
                key={event.id}
                className="absolute h-2 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-foreground/45"
                style={{ left: `${left}%` }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => onSeek(startMs)}
            aria-label="Go to replay start"
            title="Go to start"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => onSeek(playheadMs - 10_000)}
            aria-label="Seek backward 10 seconds"
            title="Back 10 seconds (Left arrow)"
          >
            <StepBack className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            className="h-9 w-9"
            onClick={onTogglePlay}
            aria-label={playing ? 'Pause replay' : 'Play replay'}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={onStop}
            aria-label="Stop replay"
            title="Stop"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => onSeek(playheadMs + 10_000)}
            aria-label="Seek forward 10 seconds"
            title="Forward 10 seconds (Right arrow)"
          >
            <StepForward className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={onRestart}
            aria-label="Restart and play"
            title="Restart and play"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
          {SPEEDS.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={speed === option ? 'secondary' : 'ghost'}
              className="h-7 min-w-9 px-2 font-mono text-[11px]"
              onClick={() => onSpeedChange(option)}
              aria-pressed={speed === option}
            >
              {option}x
            </Button>
          ))}
        </div>

        <div className="ml-auto min-w-0 text-right">
          <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {formatReplayElapsed(elapsedMs)} / {formatReplayElapsed(durationMs)}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {formatDateTime(new Date(playheadMs).toISOString())} · {Math.round(progress)}%
          </p>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        Replay {playing ? 'playing' : 'paused'} at {speed} times speed,
        {formatReplayElapsed(elapsedMs)} elapsed.
      </p>
    </section>
  );
});
