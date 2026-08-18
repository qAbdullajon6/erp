'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/shared/list-states';
import { WorkspaceHeader } from '@/components/shared/page-header';
import { SearchInput } from '@/components/shared/search-input';
import { PaginationBar } from '@/components/shared/pagination-bar';
import {
  useArchiveGeofenceMutation,
  useGeofence,
  useGeofenceEventsList,
  useGeofencesList,
  useRestoreGeofenceMutation,
  type Geofence,
} from '@/lib/api/telematics-geofences';
import type { GeofenceEventItem, GeofenceEventType } from '@/lib/api/telematics';
import { useCustomersList } from '@/lib/api/customers';
import { useCurrentUser } from '@/lib/api/auth';
import { describeError } from '@/lib/api/describe-error';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { ADMIN_OPS_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import { cn } from '@/lib/utils';
import { GeofencesMap } from '@/components/fleet-geofences/geofences-map';
import { GeofencesList } from '@/components/fleet-geofences/geofences-list';
import { GeofencesDetail } from '@/components/fleet-geofences/geofences-detail';
import { GeofencesEventsList } from '@/components/fleet-geofences/geofences-events-list';
import { GeofencesCreateSheet } from '@/components/fleet-geofences/geofences-create-sheet';
import { GeofencesEditSheet } from '@/components/fleet-geofences/geofences-edit-sheet';
import { geofenceLifecycle } from '@/components/fleet-geofences/geofences-ops';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Hexagon,
  Plus,
  RefreshCw,
} from 'lucide-react';

type FenceTab = 'active' | 'inactive' | 'archived' | 'all';
type MobilePane = 'list' | 'map' | 'detail';

const TABS: { key: FenceTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

const EVENT_TYPES: { value: '' | GeofenceEventType; label: string }[] = [
  { value: '', label: 'All events' },
  { value: 'ENTER', label: 'Entered' },
  { value: 'EXIT', label: 'Exited' },
  { value: 'DWELL', label: 'Dwell' },
];

export function GeofencesWorkspace() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: '/app/geofences/' });
  const { data: currentUser } = useCurrentUser();
  const canWrite =
    !!currentUser &&
    ADMIN_OPS_ROLES.includes(currentUser.membership.role as MembershipRole);

  const tab = (
    TABS.some((t) => t.key === searchState.tab) ? searchState.tab : 'active'
  ) as FenceTab;
  const page = searchState.page || 1;
  const search = searchState.search || '';
  const selectedId = searchState.id || null;
  const createOpen = Boolean(searchState.create);
  const eventType = (
    EVENT_TYPES.some((t) => t.value === searchState.eventType)
      ? searchState.eventType
      : ''
  ) as '' | GeofenceEventType;

  const includeArchived = tab === 'archived' || tab === 'all';
  const fetchLimit = tab === 'active' || tab === 'inactive' ? 100 : 20;

  const list = useGeofencesList({
    page: tab === 'active' || tab === 'inactive' ? 1 : page,
    limit: fetchLimit,
    search: search || undefined,
    includeArchived,
  });

  const customers = useCustomersList({
    page: 1,
    limit: 100,
    sortBy: 'companyName',
    sortOrder: 'asc',
  });
  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers.data) map.set(c.id, c.companyName);
    return map;
  }, [customers.data]);

  const [localSearch, setLocalSearch] = useState(search);
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);
  const debouncedSearch = useDebouncedValue(localSearch, 300);
  useEffect(() => {
    if (debouncedSearch === search) return;
    void navigate({
      to: '/app/geofences',
      search: (prev) => ({
        ...prev,
        page: 1,
        search: debouncedSearch || undefined,
      }),
    });
  }, [debouncedSearch, search, navigate]);

  const fences = useMemo(() => {
    const items = list.items;
    if (tab === 'archived') return items.filter((f) => Boolean(f.archivedAt));
    if (tab === 'active')
      return items.filter((f) => !f.archivedAt && f.active);
    if (tab === 'inactive')
      return items.filter((f) => !f.archivedAt && !f.active);
    return items;
  }, [list.items, tab]);

  const fenceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of list.items) map.set(f.id, f.name);
    return map;
  }, [list.items]);

  const selectedFromList = useMemo(
    () => fences.find((f) => f.id === selectedId) ?? null,
    [fences, selectedId],
  );
  const detailQuery = useGeofence(selectedId, {
    enabled: !!selectedId && !selectedFromList,
  });
  const selectedFence: Geofence | null =
    selectedFromList ?? detailQuery.data ?? null;

  const eventsQuery = useGeofenceEventsList({
    page: 1,
    limit: 100,
    geofenceId: selectedId || undefined,
    type: eventType || undefined,
  });

  const [highlightedEvent, setHighlightedEvent] =
    useState<GeofenceEventItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePane>('list');

  const archive = useArchiveGeofenceMutation();
  const restore = useRestoreGeofenceMutation();

  useEffect(() => {
    setHighlightedEvent(null);
  }, [selectedId, eventType]);

  const selectFence = useCallback(
    (id: string) => {
      void navigate({
        to: '/app/geofences',
        search: (prev) => ({ ...prev, id }),
      });
      setMobilePane('detail');
    },
    [navigate],
  );

  const onEventSelect = useCallback(
    (event: GeofenceEventItem) => {
      setHighlightedEvent(event);
      if (event.geofenceId !== selectedId) {
        void navigate({
          to: '/app/geofences',
          search: (prev) => ({ ...prev, id: event.geofenceId }),
        });
      }
      setMobilePane('map');
    },
    [navigate, selectedId],
  );

  const handleArchive = async () => {
    if (!selectedFence) return;
    try {
      await archive.mutateAsync(selectedFence.id);
      toast.success('Geofence archived');
      setArchiveOpen(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to archive geofence'));
    }
  };

  const handleRestore = async () => {
    if (!selectedFence) return;
    try {
      await restore.mutateAsync(selectedFence.id);
      toast.success('Geofence restored');
    } catch (err) {
      toast.error(describeError(err, 'Failed to restore geofence'));
    }
  };

  const showServerPagination = tab === 'archived' || tab === 'all';
  const meta = list.meta;

  return (
    <div
      className="flex h-[calc(100dvh-3.5rem)] flex-col"
      data-testid="geofences-workspace"
    >
      <WorkspaceHeader
        title="Geofences"
        icon={<Hexagon className="h-4 w-4 shrink-0 text-brand" aria-hidden />}
        subtitle={
          list.isLoading
            ? 'Loading geofences…'
            : list.isError
              ? list.errorMessage
              : fences.length === 0
                ? 'No geofences in this view'
                : `${fences.length} fence${fences.length === 1 ? '' : 's'} · provider-independent`
        }
        action={
          <>
          <Button size="sm" variant="outline" className="h-8" asChild>
            <Link to="/app/fleet-tracking">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Fleet Tracking
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
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
          {canWrite ? (
            <Button
              size="sm"
              className="h-8"
              onClick={() =>
                void navigate({
                  to: '/app/geofences',
                  search: (prev) => ({ ...prev, create: true }),
                })
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create
            </Button>
          ) : null}
          </>
        }
      />

      {list.isError ? (
        <div className="p-6">
          <ErrorState
            message={list.errorMessage ?? 'Failed to load geofences'}
            onRetry={() => void list.refetch()}
          />
        </div>
      ) : (
        <>
          <div className="flex gap-1 border-b border-border/50 px-3 py-1.5 lg:hidden">
            {(
              [
                ['list', 'List'],
                ['map', 'Map'],
                ['detail', 'Detail'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium',
                  mobilePane === key
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground',
                )}
                onClick={() => setMobilePane(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)_minmax(16rem,22rem)]">
            <aside
              className={cn(
                'min-h-0 flex-col border-r border-border/60 bg-surface',
                mobilePane === 'list' ? 'flex' : 'hidden lg:flex',
              )}
            >
              <div className="space-y-2 border-b border-border/50 p-3">
                <SearchInput
                  size="sm"
                  value={localSearch}
                  onChange={setLocalSearch}
                  placeholder="Search geofences…"
                  label="Search geofences"
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
                          to: '/app/geofences',
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

              <div className="min-h-0 flex-1 overflow-y-auto">
                <GeofencesList
                  fences={fences}
                  selectedId={selectedId}
                  onSelect={selectFence}
                  customerNameById={customerNameById}
                  loading={list.isLoading}
                />
              </div>

              {showServerPagination && meta && meta.totalPages > 1 ? (
                <div className="border-t border-border/50 p-2">
                  <PaginationBar
                    page={meta.page}
                    totalPages={meta.totalPages}
                    total={meta.total}
                    onPageChange={(next) =>
                      void navigate({
                        to: '/app/geofences',
                        search: (prev) => ({ ...prev, page: next }),
                      })
                    }
                  />
                </div>
              ) : null}
            </aside>

            <main
              className={cn(
                'relative min-h-0 bg-muted/20',
                mobilePane === 'map' ? 'block' : 'hidden lg:block',
              )}
            >
              <GeofencesMap
                fences={fences}
                selectedId={selectedId}
                highlightedEvent={highlightedEvent}
                onSelect={selectFence}
              />
              {fences.length === 0 && !list.isLoading ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                  <p className="rounded-md bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                    {tab === 'archived'
                      ? 'No archived geofences'
                      : 'Create a geofence to plot it on the map'}
                  </p>
                </div>
              ) : null}
            </main>

            <aside
              className={cn(
                'min-h-0 flex-col overflow-y-auto border-l border-border/60 bg-surface',
                mobilePane === 'detail' ? 'flex' : 'hidden lg:flex',
              )}
            >
              <GeofencesDetail
                fence={selectedFence}
                customerName={
                  selectedFence?.linkedCustomerId
                    ? customerNameById.get(selectedFence.linkedCustomerId) ??
                      null
                    : null
                }
                recentEvents={
                  selectedId
                    ? eventsQuery.items.filter(
                        (e) => e.geofenceId === selectedId,
                      )
                    : []
                }
                canWrite={canWrite}
                onEdit={() => setEditOpen(true)}
                onArchive={() => void handleArchive()}
                onRestore={() => void handleRestore()}
                archiveOpen={archiveOpen}
                onArchiveOpenChange={setArchiveOpen}
                archivePending={archive.isPending}
                restorePending={restore.isPending}
                loading={!!selectedId && !selectedFence && detailQuery.isLoading}
              />

              <div className="border-t border-border/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Event filter
                  </label>
                  <select
                    value={eventType}
                    onChange={(e) =>
                      void navigate({
                        to: '/app/geofences',
                        search: (prev) => ({
                          ...prev,
                          eventType:
                            (e.target.value as GeofenceEventType) || undefined,
                        }),
                      })
                    }
                    className="h-7 rounded-md border border-border bg-background px-2 text-[11px]"
                    aria-label="Filter events by type"
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t.value || 'all'} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <GeofencesEventsList
                  events={eventsQuery.items}
                  selectedEventId={highlightedEvent?.id ?? null}
                  onSelect={onEventSelect}
                  errorMessage={eventsQuery.errorMessage}
                  loading={eventsQuery.isLoading}
                  fenceNameById={fenceNameById}
                />
                {selectedFence ? (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Status: {geofenceLifecycle(selectedFence)}
                    {selectedId
                      ? ' · Events scoped to selected fence when filtered'
                      : ''}
                  </p>
                ) : null}
              </div>
            </aside>
          </div>
        </>
      )}

      {canWrite ? (
        <>
          <GeofencesCreateSheet
            open={createOpen}
            onOpenChange={(open) =>
              void navigate({
                to: '/app/geofences',
                search: (prev) => ({
                  ...prev,
                  create: open ? true : undefined,
                }),
              })
            }
            onCreated={(id) =>
              void navigate({
                to: '/app/geofences',
                search: (prev) => ({
                  ...prev,
                  create: undefined,
                  id,
                  tab: 'all',
                }),
              })
            }
          />
          <GeofencesEditSheet
            fence={selectedFence}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
        </>
      ) : null}
    </div>
  );
}
