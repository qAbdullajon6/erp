'use client';

import { useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  Car,
  CheckCircle2,
  Clock,
  FileText,
  Gauge,
  Minus,
  PackagePlus,
  Route as RouteIcon,
  Timer,
  Truck,
  Users,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SurfaceCard } from '@/components/ui/surface-card';
import { AnimatedMetricValue } from '@/components/dispatch/analytics/animated-metric-value';
import type { AnalyticsTrend, DispatchAnalyticsLive, DispatchAnalyticsPeriod } from '@/lib/api/dispatch-analytics';
import type { DispatchBoardSummary } from '@/lib/api/dashboard';
import { cn } from '@/lib/utils';

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

type NavTarget =
  | { to: '/app/dispatches'; search?: Record<string, string> }
  | { to: '/app/dispatches/board' }
  | { to: '/app/dispatches/calendar'; search?: Record<string, string> };

interface CardDef {
  key: string;
  label: string;
  icon: LucideIcon;
  format?: (value: number) => string;
  tone?: 'default' | 'warning' | 'destructive' | 'success';
  nav: NavTarget;
}

const LIVE_DEFS: CardDef[] = [
  { key: 'activeDispatches', label: 'Active Dispatches', icon: Truck, nav: { to: '/app/dispatches', search: { tab: 'active' } } },
  { key: 'draftDispatches', label: 'Draft Dispatches', icon: FileText, nav: { to: '/app/dispatches/calendar', search: { dispatchStatus: 'DRAFT' } } },
  { key: 'delayedDispatches', label: 'Delayed Dispatches', icon: AlertTriangle, tone: 'warning', nav: { to: '/app/dispatches', search: { tab: 'action' } } },
  { key: 'activeDrivers', label: 'Busy Drivers', icon: Users, nav: { to: '/app/dispatches/board' } },
  { key: 'idleDrivers', label: 'Idle Drivers', icon: Users, nav: { to: '/app/dispatches/board' } },
  { key: 'activeVehicles', label: 'Busy Vehicles', icon: Car, nav: { to: '/app/dispatches/board' } },
  { key: 'idleVehicles', label: 'Idle Vehicles', icon: Car, nav: { to: '/app/dispatches/board' } },
  { key: 'currentConflicts', label: 'Current Conflicts', icon: Zap, tone: 'destructive', nav: { to: '/app/dispatches/calendar', search: { kpiFocus: 'conflicts' } } },
];

const PERIOD_DEFS: CardDef[] = [
  { key: 'dispatchesCreated', label: 'Dispatches Created', icon: PackagePlus, nav: { to: '/app/dispatches', search: { tab: 'all' } } },
  { key: 'completed', label: 'Completed', icon: CheckCircle2, tone: 'success', nav: { to: '/app/dispatches', search: { tab: 'delivered' } } },
  { key: 'cancelled', label: 'Cancelled', icon: Ban, nav: { to: '/app/dispatches', search: { tab: 'cancelled' } } },
  { key: 'onTimeDeliveryRate', label: 'On-Time Delivery Rate', icon: Gauge, format: formatPercent, tone: 'success', nav: { to: '/app/dispatches', search: { tab: 'delivered' } } },
  { key: 'avgAssignmentMinutes', label: 'Avg Assignment Time', icon: Timer, format: formatMinutes, nav: { to: '/app/dispatches', search: { tab: 'action' } } },
  { key: 'avgTripDurationMinutes', label: 'Avg Trip Duration', icon: RouteIcon, format: formatMinutes, nav: { to: '/app/dispatches', search: { tab: 'in_transit' } } },
];

function TrendBadge({ trend }: { trend: AnalyticsTrend | null }) {
  // No comparison period requested/available, or this is a live gauge with no
  // historical baseline to compare against (see the file comment in
  // dispatch-analytics.types.ts) — say so honestly rather than fabricating
  // a percentage.
  if (!trend || trend.previous == null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-brand/60" aria-hidden="true" />
        Live
      </span>
    );
  }
  const pct = trend.percentChange == null ? null : Math.round(trend.percentChange);
  const direction: 'up' | 'down' | 'flat' =
    pct == null ? (trend.current > 0 ? 'up' : 'flat') : pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const label = pct == null ? (trend.current > 0 ? '—' : '0%') : `${pct > 0 ? '+' : ''}${pct}%`;
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
        direction === 'up' && 'text-success',
        direction === 'down' && 'text-destructive',
        direction === 'flat' && 'text-muted-foreground',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
      <span className="sr-only"> vs prior period</span>
    </span>
  );
}

function KpiCard({ def, value, trend }: { def: CardDef; value: number; trend: AnalyticsTrend | null }) {
  const navigate = useNavigate();
  const Icon = def.icon;
  const formatter = def.format ?? ((n: number) => n.toLocaleString());
  const highlight = (def.tone === 'warning' && value > 0) || (def.tone === 'destructive' && value > 0);

  return (
    <button
      type="button"
      data-testid={`analytics-kpi-${def.key}`}
      onClick={() => {
        if ('search' in def.nav && def.nav.search) {
          void navigate({ to: def.nav.to, search: def.nav.search });
        } else {
          void navigate({ to: def.nav.to });
        }
      }}
      className={cn(
        'group flex h-full w-full flex-col rounded-2xl border bg-surface text-left transition-all duration-200',
        'hover:border-brand/35 hover:shadow-lg hover:shadow-brand/5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        highlight ? 'border-warning/25' : 'border-border',
        def.tone === 'destructive' && value > 0 && 'border-destructive/30',
      )}
    >
      <SurfaceCard className="flex h-full flex-1 flex-col border-0 bg-transparent p-4 shadow-none sm:p-5">
        <div className="flex flex-1 items-start justify-between gap-3">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <p className="min-h-[2.75rem] text-xs font-medium leading-snug text-muted-foreground sm:text-sm">
              {def.label}
            </p>
            <p className="mt-2 text-2xl font-semibold leading-none text-foreground sm:text-3xl">
              <AnimatedMetricValue value={value} formatter={formatter} />
            </p>
            <p className="mt-auto flex items-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              <TrendBadge trend={trend} />
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-xl p-2.5',
              highlight ? 'bg-warning/10 text-warning' : 'bg-muted/50 text-muted-foreground',
              def.tone === 'destructive' && value > 0 && 'bg-destructive/10 text-destructive',
              def.tone === 'success' && value > 0 && 'bg-success/10 text-success',
            )}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
          </span>
        </div>
      </SurfaceCard>
    </button>
  );
}

interface DispatchAnalyticsKpisProps {
  live: DispatchAnalyticsLive | null;
  period: DispatchAnalyticsPeriod | null;
  board: DispatchBoardSummary | null;
  currentConflicts: number;
  loading: boolean;
}

function KpiGrid({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="space-y-2.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
      <div className="grid auto-rows-fr grid-cols-2 items-stretch gap-3 min-[900px]:grid-cols-4">{children}</div>
    </div>
  );
}

export function DispatchAnalyticsKpis({ live, period, board, currentConflicts, loading }: DispatchAnalyticsKpisProps) {
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[108px] rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`p-${i}`} className="h-[108px] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!live || !period) return null;

  const liveValues: Record<string, number> = {
    activeDispatches: live.activeDispatches,
    draftDispatches: live.draftDispatches,
    delayedDispatches: live.delayedDispatches,
    activeDrivers: board?.drivers.busy.length ?? 0,
    idleDrivers: board?.drivers.available.length ?? 0,
    activeVehicles: board?.vehicles.busy.length ?? 0,
    idleVehicles: board?.vehicles.available.length ?? 0,
    currentConflicts,
  };

  return (
    <div className="space-y-5" data-testid="dispatch-analytics-kpis" aria-label="Dispatch operations KPIs">
      <KpiGrid label="Live right now">
        {LIVE_DEFS.map((def) => (
          <KpiCard key={def.key} def={def} value={liveValues[def.key] ?? 0} trend={null} />
        ))}
      </KpiGrid>
      <KpiGrid label="This period">
        {PERIOD_DEFS.map((def) => {
          const trend = period[def.key as keyof DispatchAnalyticsPeriod];
          return <KpiCard key={def.key} def={def} value={trend.current} trend={trend} />;
        })}
      </KpiGrid>
    </div>
  );
}
