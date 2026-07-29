'use client';

import { useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Car,
  CheckCircle2,
  Clock,
  FileText,
  Minus,
  Timer,
  Truck,
  Users,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SurfaceCard } from '@/components/ui/surface-card';
import { AnimatedMetricValue } from '@/components/dispatch/analytics/animated-metric-value';
import type {
  DispatchAnalyticsKpis,
  DispatchAnalyticsTrend,
} from '@/lib/dispatch/dispatch-analytics.types';
import { cn } from '@/lib/utils';

type KpiMetricKey = Exclude<keyof DispatchAnalyticsKpis, 'trends'>;

interface KpiDef {
  key: KpiMetricKey;
  label: string;
  icon: LucideIcon;
  format?: (value: number) => string;
  tone?: 'default' | 'warning' | 'destructive' | 'success';
}

const KPI_NAV: Record<
  KpiMetricKey,
  | { to: '/app/dispatches'; search?: Record<string, string> }
  | { to: '/app/dispatches/board' }
  | { to: '/app/dispatches/calendar'; search?: Record<string, string> }
> = {
  activeDispatches: { to: '/app/dispatches', search: { tab: 'active' } },
  draftDispatches: { to: '/app/dispatches/calendar', search: { dispatchStatus: 'DRAFT' } },
  delayedDispatches: { to: '/app/dispatches', search: { tab: 'action' } },
  completedToday: { to: '/app/dispatches', search: { tab: 'delivered' } },
  activeDrivers: { to: '/app/dispatches/board' },
  activeVehicles: { to: '/app/dispatches/board' },
  avgAssignmentMinutes: { to: '/app/dispatches', search: { tab: 'action' } },
  currentConflicts: { to: '/app/dispatches/calendar', search: { kpiFocus: 'conflicts' } },
};

const KPI_DEFS: KpiDef[] = [
  {
    key: 'activeDispatches',
    label: 'Active Dispatches',
    icon: Truck,
    tone: 'default',
  },
  {
    key: 'draftDispatches',
    label: 'Draft Dispatches',
    icon: FileText,
    tone: 'default',
  },
  {
    key: 'delayedDispatches',
    label: 'Delayed Dispatches',
    icon: AlertTriangle,
    tone: 'warning',
  },
  {
    key: 'completedToday',
    label: 'Completed Today',
    icon: CheckCircle2,
    tone: 'success',
  },
  {
    key: 'activeDrivers',
    label: 'Active Drivers',
    icon: Users,
    tone: 'default',
  },
  {
    key: 'activeVehicles',
    label: 'Active Vehicles',
    icon: Car,
    tone: 'default',
  },
  {
    key: 'avgAssignmentMinutes',
    label: 'Avg Assignment Time',
    icon: Timer,
    format: formatAssignmentMinutes,
    tone: 'default',
  },
  {
    key: 'currentConflicts',
    label: 'Current Conflicts',
    icon: Zap,
    tone: 'destructive',
  },
];

function formatAssignmentMinutes(minutes: number): string {
  if (minutes <= 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function TrendBadge({ trend }: { trend: DispatchAnalyticsTrend }) {
  const Icon = trend.direction === 'up' ? ArrowUp : trend.direction === 'down' ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
        trend.direction === 'up' && 'text-success',
        trend.direction === 'down' && 'text-destructive',
        trend.direction === 'flat' && 'text-muted-foreground',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {trend.label}
      <span className="sr-only"> vs prior 7 days</span>
    </span>
  );
}

function KpiCard({
  def,
  value,
  trend,
}: {
  def: KpiDef;
  value: number;
  trend: DispatchAnalyticsTrend;
}) {
  const navigate = useNavigate();
  const Icon = def.icon;
  const formatter = def.format ?? ((n) => n.toLocaleString());
  const navTarget = KPI_NAV[def.key];
  const highlight =
    (def.tone === 'warning' && value > 0) ||
    (def.tone === 'destructive' && value > 0);

  return (
    <button
      type="button"
      data-testid={`analytics-kpi-${def.key}`}
      onClick={() => {
        if ('search' in navTarget && navTarget.search) {
          void navigate({ to: navTarget.to, search: navTarget.search });
        } else {
          void navigate({ to: navTarget.to });
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
            <p className="line-clamp-2 min-h-[2.5rem] text-xs font-medium text-muted-foreground sm:text-sm">
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
  kpis: DispatchAnalyticsKpis | null;
  loading: boolean;
}

export function DispatchAnalyticsKpis({ kpis, loading }: DispatchAnalyticsKpisProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4 min-[1280px]:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!kpis) return null;

  return (
    <div
      className="grid auto-rows-fr grid-cols-2 items-stretch gap-3 min-[900px]:grid-cols-4"
      data-testid="dispatch-analytics-kpis"
      aria-label="Dispatch operations KPIs"
    >
      {KPI_DEFS.map((def) => (
        <KpiCard
          key={def.key}
          def={def}
          value={kpis[def.key]}
          trend={kpis.trends[def.key]}
        />
      ))}
    </div>
  );
}
