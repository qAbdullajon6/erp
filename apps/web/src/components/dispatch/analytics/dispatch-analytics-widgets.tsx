'use client';

import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRight,
  Car,
  Package,
  Route as RouteIcon,
  UserRound,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SurfaceCard, SurfaceCardHeader } from '@/components/ui/surface-card';
import { Badge } from '@/components/ui/badge';
import type { DispatchAnalyticsRouteRow } from '@/lib/api/dispatch-analytics';
import type { DispatchAnalyticsInsightsSnapshot } from '@/lib/dispatch/dispatch-analytics.types';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

interface DispatchAnalyticsWidgetsProps {
  topDelayedRoutes: DispatchAnalyticsRouteRow[] | null;
  insights: DispatchAnalyticsInsightsSnapshot | null;
  loading: boolean;
}

function WidgetShell({
  title,
  subtitle,
  children,
  testId,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <SurfaceCard className="flex h-full flex-col p-4 sm:p-5" data-testid={testId}>
      <SurfaceCardHeader className="mb-3 px-0 py-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
      </SurfaceCardHeader>
      <div className="min-h-0 flex-1">{children}</div>
    </SurfaceCard>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{message}</p>;
}

export function DispatchAnalyticsWidgets({ topDelayedRoutes, insights, loading }: DispatchAnalyticsWidgetsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[240px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!topDelayedRoutes || !insights) return null;

  const { conflictSummary } = insights;

  return (
    <div
      className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3"
      data-testid="dispatch-analytics-widgets"
    >
      <WidgetShell title="Top Delayed Routes" subtitle="Most impacted lanes, live" testId="widget-delayed-routes">
        {topDelayedRoutes.length > 0 ? (
          <ul className="space-y-2">
            {topDelayedRoutes.map((row) => (
              <li key={row.route}>
                <Link
                  to="/app/dispatches"
                  search={{ tab: 'action' }}
                  className="group flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2 transition-colors hover:border-foreground/20 hover:bg-muted/30"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <RouteIcon className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                    <span className="truncate text-sm text-foreground">{row.route}</span>
                  </div>
                  <Badge variant="outline" className="shrink-0 tabular-nums">
                    {row.count}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyRow message="No delayed routes" />
        )}
      </WidgetShell>

      <WidgetShell title="Drivers Needing Attention" subtitle="Overload, leave, or conflicts" testId="widget-drivers">
        {insights.driversNeedingAttention.length > 0 ? (
          <ul className="space-y-2">
            {insights.driversNeedingAttention.map((driver) => (
              <li
                key={driver.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{driver.name}</p>
                    <p className="text-xs text-muted-foreground">{driver.reason}</p>
                  </div>
                </div>
                {driver.dispatchCount > 0 ? (
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {driver.dispatchCount}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyRow message="All drivers look clear" />
        )}
      </WidgetShell>

      <WidgetShell title="Vehicles Needing Maintenance" subtitle="Maintenance queue & conflicts" testId="widget-vehicles">
        {insights.vehiclesNeedingMaintenance.length > 0 ? (
          <ul className="space-y-2">
            {insights.vehiclesNeedingMaintenance.map((vehicle) => (
              <li
                key={vehicle.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Car className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate text-sm font-medium text-foreground">{vehicle.plate}</span>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    vehicle.status === 'MAINTENANCE' && 'border-warning/40 text-warning',
                  )}
                >
                  {vehicle.status.replace(/_/g, ' ')}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyRow message="No maintenance flags" />
        )}
      </WidgetShell>

      <WidgetShell title="Dispatches Without Assignment" subtitle="Unassigned orders awaiting dispatch" testId="widget-unassigned">
        {insights.unassignedDispatches.length > 0 ? (
          <ul className="space-y-2">
            {insights.unassignedDispatches.map((row) => (
              <li key={row.orderId}>
                <Link
                  to="/app/dispatches"
                  search={{ create: true, orderId: row.orderId }}
                  className="group flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2 transition-colors hover:border-brand/30 hover:bg-muted/30"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{row.orderNumber}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.customerName ? `${row.customerName} · ` : ''}
                        {row.route}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Pickup {formatDate(row.pickupDate)}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyRow message="No unassigned orders" />
        )}
      </WidgetShell>

      <WidgetShell
        title="Conflict Summary"
        subtitle={`${conflictSummary.total} active across fleet`}
        testId="widget-conflicts"
      >
        {conflictSummary.total > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Critical', value: conflictSummary.critical, tone: 'text-destructive' },
                { label: 'High', value: conflictSummary.high, tone: 'text-warning' },
                { label: 'Medium', value: conflictSummary.medium, tone: 'text-foreground' },
                { label: 'Low', value: conflictSummary.low, tone: 'text-muted-foreground' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border/70 px-2.5 py-2 text-center">
                  <p className={cn('text-lg font-semibold tabular-nums', item.tone)}>{item.value}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
            {conflictSummary.byType.length > 0 ? (
              <ul className="space-y-1.5">
                {conflictSummary.byType.map((row) => (
                  <li key={row.type} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <AlertTriangle className="h-3 w-3 text-warning" aria-hidden="true" />
                      {row.type.replace(/_/g, ' ')}
                    </span>
                    <span className="font-medium tabular-nums text-foreground">{row.count}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <Link
              to="/app/dispatches/calendar"
              search={{ kpiFocus: 'conflicts' }}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              Review on calendar
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <EmptyRow message="No active conflicts" />
        )}
      </WidgetShell>
    </div>
  );
}
