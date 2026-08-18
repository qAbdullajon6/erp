'use client';

import { Link } from '@tanstack/react-router';
import { ArrowRight, Lightbulb, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SurfaceCard, SurfaceCardHeader } from '@/components/ui/surface-card';
import { Badge } from '@/components/ui/badge';
import type { DispatchAnalyticsInsight } from '@/lib/dispatch/dispatch-analytics.types';
import { cn } from '@/lib/utils';

interface DispatchAnalyticsInsightsProps {
  insights: DispatchAnalyticsInsight[];
  loading: boolean;
}

const SEVERITY_STYLES: Record<
  DispatchAnalyticsInsight['severity'],
  { border: string; badge: string; icon: string }
> = {
  info: {
    border: 'border-brand/20',
    badge: 'bg-brand/10 text-brand',
    icon: 'text-brand',
  },
  warning: {
    border: 'border-warning/25',
    badge: 'bg-warning/10 text-warning',
    icon: 'text-warning',
  },
  critical: {
    border: 'border-destructive/30',
    badge: 'bg-destructive/10 text-destructive',
    icon: 'text-destructive',
  },
};

function InsightAction({ insight }: { insight: DispatchAnalyticsInsight }) {
  const className =
    'inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/40';

  if (insight.actionTo === '/app/dispatches/$dispatchId' && insight.actionParams) {
    return (
      <Link
        to="/app/dispatches/$dispatchId"
        params={insight.actionParams}
        className={className}
      >
        {insight.actionLabel}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    );
  }

  if (insight.actionTo === '/app/dispatches/board') {
    return (
      <Link to="/app/dispatches/board" className={className}>
        {insight.actionLabel}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    );
  }

  if (insight.actionTo === '/app/dispatches') {
    return (
      <Link
        to="/app/dispatches"
        search={insight.actionSearch as { tab?: string; create?: boolean; orderId?: string }}
        className={className}
      >
        {insight.actionLabel}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    );
  }

  if (insight.actionHref) {
    return (
      <a href={insight.actionHref} className={className}>
        {insight.actionLabel}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </a>
    );
  }

  return null;
}

export function DispatchAnalyticsInsights({ insights, loading }: DispatchAnalyticsInsightsProps) {
  if (loading) {
    return <Skeleton className="h-[280px] w-full rounded-xl" />;
  }

  return (
    <SurfaceCard className="p-4 sm:p-5" data-testid="dispatch-analytics-insights">
      <SurfaceCardHeader className="mb-4 px-0 py-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-foreground">Operations Insights</h3>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Deterministic recommendations from dispatch and conflict data
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wide">
            Rules-based
          </Badge>
        </div>
      </SurfaceCardHeader>

      {insights.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-10 text-center">
          <Lightbulb className="mb-2 h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Operations look stable — no recommendations right now.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {insights.map((insight) => {
            const styles = SEVERITY_STYLES[insight.severity];
            return (
              <li
                key={insight.id}
                className={cn(
                  'rounded-xl border bg-surface-elevated/40 p-4 transition-colors',
                  styles.border,
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Lightbulb className={cn('h-3.5 w-3.5 shrink-0', styles.icon)} aria-hidden="true" />
                      <p className="text-sm font-semibold text-foreground">{insight.title}</p>
                      <Badge variant="secondary" className={cn('text-[10px] capitalize', styles.badge)}>
                        {insight.severity}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{insight.detail}</p>
                  </div>
                  {insight.actionLabel ? (
                    <InsightAction insight={insight} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SurfaceCard>
  );
}
