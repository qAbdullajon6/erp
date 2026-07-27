'use client';

import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState, LoadingState } from '@/components/shared/list-states';
import {
  TELEMATICS_PROVIDERS,
  telematicsDeviceKeys,
  telematicsDevicesAPI,
  type TelematicsProviderType,
} from '@/lib/api/telematics-devices';
import { describeError } from '@/lib/api/describe-error';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  providerDescription,
  providerLabel,
  summarizeProviderDevices,
} from '@/components/fleet-providers/providers-ops';
import { ArrowRight, Plug, Radio } from 'lucide-react';

export function ProvidersOverview() {
  const queries = useQueries({
    queries: TELEMATICS_PROVIDERS.map((provider) => ({
      queryKey: telematicsDeviceKeys.list({
        provider,
        includeArchived: true,
        page: 1,
        limit: 100,
      }),
      queryFn: () =>
        telematicsDevicesAPI.list({
          provider,
          includeArchived: true,
          page: 1,
          limit: 100,
        }),
    })),
  });

  const loading = queries.some((q) => q.isPending);
  const firstError = queries.find((q) => q.isError)?.error;
  const errorMessage = firstError
    ? describeError(firstError, 'Failed to load provider devices')
    : null;

  const dataStamp = queries.map((q) => q.dataUpdatedAt).join(',');

  const summaries = useMemo(
    () =>
      TELEMATICS_PROVIDERS.map((provider, index) => {
        const data = queries[index]?.data;
        return summarizeProviderDevices(
          provider,
          data?.items ?? [],
          data?.meta.total ?? 0,
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by dataStamp
    [dataStamp],
  );

  if (loading) {
    return (
      <div className="p-6">
        <LoadingState label="Loading GPS providers…" />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="p-6">
        <ErrorState
          message={errorMessage}
          onRetry={() => {
            for (const q of queries) void q.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6" data-testid="providers-overview">
      <PageHeader
        title="GPS Providers"
        subtitle="Administrator view of supported ingest providers and their registered devices. Connection credentials beyond device secrets are not exposed by the API."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link to="/app/devices">
              <Radio className="mr-1.5 h-3.5 w-3.5" />
              All devices
            </Link>
          </Button>
        }
      />

      <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Provider connection status:{' '}
        <span className="font-medium text-foreground">Not available</span> —
        the backend has no provider-level connection or OAuth health endpoints.
        Status below is derived only from registered devices (
        <code className="text-[10px]">active</code>,{' '}
        <code className="text-[10px]">archivedAt</code>,{' '}
        <code className="text-[10px]">lastSeenAt</code>).
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summaries.map((summary) => (
          <ProviderCard key={summary.provider} summary={summary} />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({
  summary,
}: {
  summary: ReturnType<typeof summarizeProviderDevices>;
}) {
  const provider = summary.provider as TelematicsProviderType;
  return (
    <Link
      to="/app/providers/$provider"
      params={{ provider }}
      className={cn(
        'group flex flex-col rounded-lg border border-border/60 bg-surface p-4 transition-colors',
        'hover:border-brand/40 hover:bg-brand/[0.03]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Plug className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {providerLabel(provider)}
            </h2>
            <p className="text-[10px] text-muted-foreground">
              {providerDescription(provider)}
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Stat label="Configured" value={String(summary.total)} />
        <Stat label="Assigned" value={assignedLabel(summary)} />
        <Stat label="Active" value={String(summary.active)} />
        <Stat label="Archived" value={String(summary.archived)} />
      </dl>

      <div className="mt-3 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
        <div className="flex justify-between gap-2">
          <span>Last activity</span>
          <span className="text-right font-medium text-foreground">
            {summary.lastSeenAt
              ? formatRelativeTime(summary.lastSeenAt)
              : 'None recorded'}
          </span>
        </div>
        {summary.lastSeenAt ? (
          <p className="mt-0.5 text-right text-[10px]">
            {formatDateTime(summary.lastSeenAt)}
          </p>
        ) : null}
        {summary.aggregatesPartial ? (
          <p className="mt-1 text-[10px] text-warning">
            Activity/assignment counts use the latest {summary.loaded.length}{' '}
            devices by create time; total configured is exact ({summary.total}).
          </p>
        ) : null}
        <div className="mt-2 flex justify-between gap-2">
          <span>Connection</span>
          <span className="font-medium text-foreground">Not available</span>
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 px-2 py-1.5">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function assignedLabel(
  summary: ReturnType<typeof summarizeProviderDevices>,
): string {
  if (summary.aggregatesPartial) {
    return `${summary.assigned} of ${summary.loaded.length} loaded`;
  }
  return String(summary.assigned);
}
