'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StreamingTurn } from '@/hooks/use-ai';
import { ToolTimeline } from './tool-timeline';

export function StreamingIndicator({ turn }: { turn: StreamingTurn }) {
  const hasTools = turn.tools.length > 0;
  const anyRunning = turn.tools.some((t) => t.status === 'running');

  // Nothing has happened yet this turn: the classic "typing" cue.
  if (!hasTools && !turn.text) {
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-brand text-brand-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <TypingDots label="Thinking" />
      </div>
    );
  }

  // No tools were needed and text has already started — the parent renders
  // the streamed markdown itself; nothing left for this component to show.
  if (!hasTools) return null;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-brand text-brand-foreground">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex flex-col gap-1.5">
        <ToolTimeline
          steps={turn.tools.map((t, i) => ({
            key: `${t.name}-${i}`,
            name: t.name,
            phase: t.status,
            durationMs: t.durationMs,
          }))}
        />
        {/* Tools are done but the model hasn't produced any text yet — a
            distinct phase from "Thinking", so a long tool-heavy turn never
            reads as having silently stalled. */}
        {!anyRunning && !turn.text && <TypingDots label="Preparing answer" compact />}
      </div>
    </div>
  );
}

/// The classic three-dot "someone is typing" cue, staggered via inline
/// `animationDelay` — Tailwind's `animate-bounce` alone would bounce all
/// three dots in lockstep, which reads as a glitch rather than typing.
function TypingDots({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-muted-foreground',
        compact ? 'text-xs' : 'text-sm',
      )}
      role="status"
      aria-label={`${label}…`}
    >
      <span>{label}…</span>
      <div className="flex items-center gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${delay}ms`, animationDuration: '900ms' }}
          />
        ))}
      </div>
    </div>
  );
}
