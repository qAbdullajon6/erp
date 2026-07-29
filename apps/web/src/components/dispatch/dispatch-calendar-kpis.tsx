'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Truck, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CalendarKpis } from './dispatch-calendar-stats';
import type { CalendarKpiFocus } from './dispatch-calendar-filters';

export type CalendarKpiKey =
  | 'total'
  | 'active'
  | 'delayed'
  | 'completed'
  | 'drivers'
  | 'vehicles'
  | 'conflicts';

interface DispatchCalendarKpisProps {
  kpis: CalendarKpis;
  activeFocus?: CalendarKpiFocus;
  onKpiClick: (key: CalendarKpiKey) => void;
}

function AnimatedValue({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const frameRef = useRef<number | null>(null);
  const fromRef = useRef(value);

  useEffect(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    const duration = 180;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [value]);

  useEffect(() => {
    fromRef.current = display;
  }, [display]);

  return <span className="text-sm font-bold tabular-nums text-foreground">{display}</span>;
}

export function DispatchCalendarKpis({ kpis, activeFocus, onKpiClick }: DispatchCalendarKpisProps) {
  const items: Array<{
    key: CalendarKpiKey;
    label: string;
    value: number;
    icon: typeof Users;
    tone: 'default' | 'brand' | 'success' | 'warning' | 'destructive' | 'muted';
    focus?: CalendarKpiFocus;
  }> = [
    { key: 'total', label: 'Dispatches', value: kpis.total, icon: Users, tone: 'default' },
    { key: 'active', label: 'Active', value: kpis.active, icon: Clock, tone: 'brand', focus: 'active' },
    {
      key: 'delayed',
      label: 'Delayed',
      value: kpis.delayed,
      icon: AlertTriangle,
      tone: kpis.delayed > 0 ? 'warning' : 'muted',
      focus: 'delayed',
    },
    {
      key: 'completed',
      label: 'Completed',
      value: kpis.completed,
      icon: CheckCircle2,
      tone: 'success',
      focus: 'completed',
    },
    { key: 'drivers', label: 'Drivers', value: kpis.drivers, icon: User, tone: 'muted' },
    { key: 'vehicles', label: 'Vehicles', value: kpis.vehicles, icon: Truck, tone: 'muted' },
    {
      key: 'conflicts',
      label: 'Visible Conflicts',
      value: kpis.conflicts,
      icon: AlertTriangle,
      tone: kpis.conflicts > 0 ? 'destructive' : 'muted',
      focus: 'conflicts',
    },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-testid="calendar-kpis"
      aria-label="Calendar operations summary"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.focus ? activeFocus === item.focus : false;

        return (
          <button
            key={item.key}
            type="button"
            data-testid={`calendar-kpi-${item.key}`}
            aria-pressed={isActive}
            onClick={() => onKpiClick(item.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-1',
              'transition-all duration-150 hover:scale-[1.02] hover:shadow-sm active:scale-[0.99]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              item.tone === 'default' && 'border-white/[0.08] bg-surface-elevated/60',
              item.tone === 'brand' && 'border-brand/30 bg-brand/10',
              item.tone === 'success' && 'border-success/30 bg-success/10',
              item.tone === 'warning' && 'border-warning/35 bg-warning/10',
              item.tone === 'destructive' && 'border-destructive/35 bg-destructive/10',
              item.tone === 'muted' && 'border-white/[0.06] bg-muted/20',
              isActive && 'ring-2 ring-brand/50 shadow-md',
            )}
          >
            <Icon
              className={cn(
                'h-3 w-3 shrink-0',
                item.tone === 'brand' && 'text-brand',
                item.tone === 'success' && 'text-success',
                item.tone === 'warning' && 'text-warning',
                item.tone === 'destructive' && 'text-destructive',
                (item.tone === 'default' || item.tone === 'muted') && 'text-muted-foreground',
              )}
              aria-hidden="true"
            />
            <AnimatedValue value={item.value} />
            <span className="hidden text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
