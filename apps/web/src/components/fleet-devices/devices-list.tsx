'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import {
  TELEMATICS_PROVIDERS,
  useTelematicsDevicesList,
  type TelematicsProviderType,
} from '@/lib/api/telematics-devices';
import { useVehiclesList } from '@/lib/api/vehicles';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  deviceLifecycleStatus,
  deviceStatusClass,
  deviceStatusLabel,
  providerLabel,
} from '@/components/fleet-devices/devices-ops';
import { DevicesCreateSheet } from '@/components/fleet-devices/devices-create-sheet';
import { Cpu, Plus, Search } from 'lucide-react';

type DeviceTab = 'active' | 'inactive' | 'archived' | 'all';

const TABS: { key: DeviceTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

export function DevicesList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/devices/' });

  const tab = (TABS.some((t) => t.key === searchState.tab) ? searchState.tab : 'active') as DeviceTab;
  const page = searchState.page || 1;
  const search = searchState.search || '';
  const provider =
    typeof searchState.provider === 'string' &&
    TELEMATICS_PROVIDERS.includes(searchState.provider as TelematicsProviderType)
      ? (searchState.provider as TelematicsProviderType)
      : undefined;
  const createOpen = Boolean(searchState.create);

  const includeArchived = tab === 'archived' || tab === 'all';
  const fetchLimit = tab === 'active' || tab === 'inactive' ? 100 : 20;

  const list = useTelematicsDevicesList({
    page: tab === 'active' || tab === 'inactive' ? 1 : page,
    limit: fetchLimit,
    search: search || undefined,
    provider,
    includeArchived,
  });

  const vehicles = useVehiclesList({ page: 1, limit: 100, includeArchived: true });
  const vehicleLabel = useMemo(() => {
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
    if (debouncedSearch === search) return;
    void navigate({
      to: '/app/devices',
      search: (prev) => ({
        ...prev,
        page: 1,
        search: debouncedSearch || undefined,
      }),
    });
  }, [debouncedSearch, search, navigate]);

  const rows = useMemo(() => {
    const items = list.items;
    if (tab === 'archived') return items.filter((d) => Boolean(d.archivedAt));
    if (tab === 'active') return items.filter((d) => !d.archivedAt && d.active);
    if (tab === 'inactive') return items.filter((d) => !d.archivedAt && !d.active);
    return items;
  }, [list.items, tab]);

  const meta = list.meta;
  const showServerPagination = tab === 'archived' || tab === 'all';

  return (
    <div className="space-y-5 p-4 sm:p-6" data-testid="devices-page">
      <PageHeader
        title="Devices"
        subtitle="GPS unit registration, vehicle binding, and ingest credentials."
        action={
          <Button
            size="sm"
            onClick={() =>
              void navigate({
                to: '/app/devices',
                search: (prev) => ({ ...prev, create: true }),
              })
            }
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Register device
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search name or external id…"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Search devices"
          />
        </div>
        <select
          value={provider ?? ''}
          onChange={(e) =>
            void navigate({
              to: '/app/devices',
              search: (prev) => ({
                ...prev,
                page: 1,
                provider: e.target.value || undefined,
              }),
            })
          }
          className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Filter by provider"
        >
          <option value="">All providers</option>
          {TELEMATICS_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {providerLabel(p)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? 'secondary' : 'outline'}
            className="h-8"
            onClick={() =>
              void navigate({
                to: '/app/devices',
                search: (prev) => ({ ...prev, tab: t.key, page: 1 }),
              })
            }
          >
            {t.label}
          </Button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState
          message={list.errorMessage ?? 'Could not load devices. Please try again.'}
          onRetry={() => void list.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title={search || provider ? 'No matching devices' : 'No devices yet'}
          description={
            search || provider
              ? 'Try a different search or provider filter.'
              : 'Register a GPS device to start ingesting live positions.'
          }
          action={
            !search && !provider ? (
              <Button
                size="sm"
                onClick={() =>
                  void navigate({
                    to: '/app/devices',
                    search: (prev) => ({ ...prev, create: true }),
                  })
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Register device
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border/60 bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Device</th>
                <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Provider</th>
                <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Vehicle</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((device) => {
                const status = deviceLifecycleStatus(device);
                return (
                  <tr key={device.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5">
                      <Link
                        to="/app/devices/$deviceId"
                        params={{ deviceId: device.id }}
                        className="block min-w-0"
                      >
                        <p className="truncate font-medium text-foreground">{device.name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {device.externalId}
                        </p>
                      </Link>
                    </td>
                    <td className="hidden px-3 py-2.5 sm:table-cell">
                      <span className="text-muted-foreground">{providerLabel(device.provider)}</span>
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      {device.vehicleId ? (
                        <Link
                          to="/app/vehicles/$vehicleId"
                          params={{ vehicleId: device.vehicleId }}
                          className="text-brand hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {vehicleLabel.get(device.vehicleId) ?? device.vehicleId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          deviceStatusClass(status),
                        )}
                      >
                        {deviceStatusLabel(status)}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-muted-foreground lg:table-cell">
                      {device.lastSeenAt ? formatRelativeTime(device.lastSeenAt) : 'Never'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showServerPagination && meta && meta.totalPages > 1 ? (
        <PaginationBar
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={(next) =>
            void navigate({
              to: '/app/devices',
              search: (prev) => ({ ...prev, page: next }),
            })
          }
        />
      ) : null}

      <DevicesCreateSheet
        open={createOpen}
        onOpenChange={(open) =>
          void navigate({
            to: '/app/devices',
            search: (prev) => ({ ...prev, create: open || undefined }),
          })
        }
        onCreated={(deviceId) =>
          void navigate({ to: '/app/devices/$deviceId', params: { deviceId } })
        }
      />
    </div>
  );
}
