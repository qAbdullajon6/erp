'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState, EmptyState } from '@/components/shared/list-states';
import { SearchInput } from '@/components/shared/search-input';
import { PaginationBar } from '@/components/shared/pagination-bar';
import {
  useTelematicsDevice,
  useTelematicsDevicesList,
  type TelematicsProviderType,
} from '@/lib/api/telematics-devices';
import { useVehiclesList } from '@/lib/api/vehicles';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ProvidersCreateDeviceSheet } from '@/components/fleet-providers/providers-create-device-sheet';
import { ProvidersDeviceList } from '@/components/fleet-providers/providers-device-list';
import { ProvidersDevicePanel } from '@/components/fleet-providers/providers-device-panel';
import {
  isTelematicsProvider,
  providerDescription,
  providerLabel,
  summarizeProviderDevices,
} from '@/components/fleet-providers/providers-ops';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

type DeviceTab = 'live' | 'archived' | 'all';

const TABS: { key: DeviceTab; label: string }[] = [
  { key: 'live', label: 'Live roster' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

export function ProvidersDetail() {
  const navigate = useNavigate();
  const { provider: providerParam } = useParams({
    from: '/app/providers/$provider',
  });
  const searchState = useSearch({ from: '/app/providers/$provider' });
  const valid = isTelematicsProvider(providerParam);
  const provider = (valid ? providerParam : 'MANUAL') as TelematicsProviderType;

  const tab = (
    TABS.some((t) => t.key === searchState.tab) ? searchState.tab : 'live'
  ) as DeviceTab;
  const page = searchState.page || 1;
  const search = searchState.search || '';
  const selectedId = searchState.deviceId || null;
  const createOpen = Boolean(searchState.create);

  const includeArchived = tab === 'archived' || tab === 'all';
  const list = useTelematicsDevicesList(
    {
      page,
      limit: 50,
      search: search || undefined,
      provider,
      includeArchived,
    },
    { enabled: valid },
  );

  const devices = useMemo(() => {
    if (tab === 'archived') {
      return list.items.filter((d) => Boolean(d.archivedAt));
    }
    if (tab === 'live') {
      return list.items.filter((d) => !d.archivedAt);
    }
    return list.items;
  }, [list.items, tab]);

  const summary = useMemo(
    () =>
      summarizeProviderDevices(
        provider,
        list.items,
        list.meta?.total ?? list.items.length,
      ),
    [provider, list.items, list.meta?.total],
  );

  const vehicles = useVehiclesList(
    {
      page: 1,
      limit: 100,
      includeArchived: true,
      sortBy: 'plateNumber',
      sortOrder: 'asc',
    },
    { enabled: valid },
  );
  const vehicleLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vehicles.items) {
      map.set(
        v.id,
        [v.plateNumber, v.vehicleCode !== v.plateNumber ? v.vehicleCode : null]
          .filter(Boolean)
          .join(' · '),
      );
    }
    return map;
  }, [vehicles.items]);

  const [localSearch, setLocalSearch] = useState(search);
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);
  const debouncedSearch = useDebouncedValue(localSearch, 300);
  useEffect(() => {
    if (!valid || debouncedSearch === search) return;
    void navigate({
      to: '/app/providers/$provider',
      params: { provider },
      search: (prev) => ({
        ...prev,
        page: 1,
        search: debouncedSearch || undefined,
      }),
    });
  }, [debouncedSearch, search, navigate, provider, valid]);

  const selectedFromList = devices.find((d) => d.id === selectedId) ?? null;
  const detailQuery = useTelematicsDevice(selectedId, {
    enabled: valid && !!selectedId && !selectedFromList,
  });
  const selectedDevice = selectedFromList ?? detailQuery.data ?? null;

  const meta = list.meta;

  if (!valid) {
    return (
      <div className="space-y-4 p-6" data-testid="providers-unsupported">
        <PageHeader title="Unsupported provider" />
        <EmptyState
          icon={ShieldAlert}
          title="Provider not recognized"
          description={`“${providerParam}” is not in the backend provider enum. Supported: Manual, Traccar, Samsara, Geotab, Generic Webhook.`}
          action={
            <Button asChild>
              <Link to="/app/providers">Back to providers</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col" data-testid="provider-detail">
      <div className="border-b border-border/60 px-4 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 h-8 px-2 text-muted-foreground"
          asChild
        >
          <Link to="/app/providers">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Providers
          </Link>
        </Button>
        <PageHeader
          title={providerLabel(provider)}
          subtitle={providerDescription(provider)}
          action={
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void list.refetch()}
                disabled={list.isFetching}
              >
                <RefreshCw
                  className={cn(
                    'mr-1.5 h-3.5 w-3.5',
                    list.isFetching && 'animate-spin',
                  )}
                />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  void navigate({
                    to: '/app/providers/$provider',
                    params: { provider },
                    search: (prev) => ({ ...prev, create: true }),
                  })
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create device
              </Button>
            </div>
          }
        />
      </div>

      {list.isError ? (
        <div className="p-6">
          <ErrorState
            message={list.errorMessage ?? 'Failed to load devices'}
            onRetry={() => void list.refetch()}
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
          <div className="flex min-h-0 flex-col border-r border-border/60">
            <section className="grid gap-2 border-b border-border/50 p-4 sm:grid-cols-4">
              <OverviewStat label="Configured" value={String(summary.total)} />
              <OverviewStat
                label="Assigned (page)"
                value={String(summary.assigned)}
              />
              <OverviewStat
                label="Last activity"
                value={
                  summary.lastSeenAt
                    ? formatRelativeTime(summary.lastSeenAt)
                    : 'None'
                }
                hint={
                  summary.lastSeenAt
                    ? formatDateTime(summary.lastSeenAt)
                    : undefined
                }
              />
              <OverviewStat
                label="Reporting"
                value={summary.total > 0 ? `${summary.active} of ${summary.total}` : 'No devices'}
                hint="Devices currently enabled for this provider"
              />
            </section>

            <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-2.5">
              <SearchInput
                className="min-w-[12rem] flex-1"
                size="sm"
                value={localSearch}
                onChange={setLocalSearch}
                placeholder="Search name or external ID…"
                label="Search devices"
              />
              <div className="flex flex-wrap gap-1" role="tablist">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    className={cn(
                      'rounded-md px-2 py-1 text-[11px] font-medium',
                      tab === t.key
                        ? 'bg-brand/15 text-brand'
                        : 'text-muted-foreground hover:bg-muted/40',
                    )}
                    onClick={() =>
                      void navigate({
                        to: '/app/providers/$provider',
                        params: { provider },
                        search: (prev) => ({
                          ...prev,
                          tab: t.key,
                          page: 1,
                        }),
                      })
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <ProvidersDeviceList
                devices={devices}
                selectedId={selectedId}
                onSelect={(id) =>
                  void navigate({
                    to: '/app/providers/$provider',
                    params: { provider },
                    search: (prev) => ({ ...prev, deviceId: id }),
                  })
                }
                vehicleLabelById={vehicleLabelById}
                loading={list.isLoading}
              />
            </div>

            {meta && meta.totalPages > 1 ? (
              <div className="border-t border-border/50 p-2">
                <PaginationBar
                  page={meta.page}
                  totalPages={meta.totalPages}
                  total={meta.total}
                  onPageChange={(next) =>
                    void navigate({
                      to: '/app/providers/$provider',
                      params: { provider },
                      search: (prev) => ({ ...prev, page: next }),
                    })
                  }
                />
              </div>
            ) : null}
          </div>

          <aside className="min-h-0 overflow-y-auto bg-surface">
            <ProvidersDevicePanel
              device={selectedDevice}
              vehicleLabel={
                selectedDevice?.vehicleId
                  ? vehicleLabelById.get(selectedDevice.vehicleId) ?? null
                  : null
              }
              loading={
                !!selectedId && !selectedDevice && detailQuery.isLoading
              }
            />
          </aside>
        </div>
      )}

      <ProvidersCreateDeviceSheet
        open={createOpen}
        provider={provider}
        onOpenChange={(open) =>
          void navigate({
            to: '/app/providers/$provider',
            params: { provider },
            search: (prev) => ({
              ...prev,
              create: open ? true : undefined,
            }),
          })
        }
        onCreated={(deviceId) =>
          void navigate({
            to: '/app/providers/$provider',
            params: { provider },
            search: (prev) => ({
              ...prev,
              create: undefined,
              deviceId,
              tab: 'all',
            }),
          })
        }
      />
    </div>
  );
}

function OverviewStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
      {hint ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
