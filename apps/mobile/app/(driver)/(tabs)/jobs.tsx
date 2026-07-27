import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import { EmptyState, ErrorState, Header, Skeleton, statusLabel } from '@/components/ui';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/tokens';
import { describeError } from '@/services/api/describe-error';
import { useMyDispatchesQuery, type DispatchStatus, type MyDispatch } from '@/services/api/endpoints/driver';
import { ExpandableJobCard } from '@/features/jobs/components/expandable-job-card';

type Tab = 'today' | 'active' | 'completed' | 'cancelled';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const ACTIVE_STATUSES: DispatchStatus[] = ['ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT'];

// Stable reference so `dispatchesQuery.data ?? EMPTY_DISPATCHES` doesn't hand
// `filtered`'s useMemo a fresh array on every render while data is loading.
const EMPTY_DISPATCHES: MyDispatch[] = [];

function isToday(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  );
}

function matchesSearch(dispatch: MyDispatch, query: string) {
  if (!query) return true;
  const haystack = [
    dispatch.dispatchNumber,
    dispatch.order.orderNumber,
    dispatch.customer.companyName,
    dispatch.order.pickupCity,
    dispatch.order.deliveryCity,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function JobsScreen() {
  const [tab, setTab] = useState<Tab>('active');
  const [statusChip, setStatusChip] = useState<DispatchStatus | null>(null);
  const [search, setSearch] = useState('');
  // includeFinished=true is fetched once and filtered client-side into all four
  // tabs — the driver's own dispatch list is small enough that four separate
  // network round trips for four tabs would be pure overhead, and this way
  // switching tabs is instant instead of re-fetching.
  const dispatchesQuery = useMyDispatchesQuery(true);
  const dispatches = dispatchesQuery.data ?? EMPTY_DISPATCHES;

  const filtered = useMemo(() => {
    let list = dispatches;
    if (tab === 'today') list = list.filter((d) => isToday(d.pickupDateScheduled));
    if (tab === 'active') list = list.filter((d) => ACTIVE_STATUSES.includes(d.status));
    if (tab === 'completed') list = list.filter((d) => d.status === 'DELIVERED');
    if (tab === 'cancelled') list = list.filter((d) => d.status === 'CANCELLED');
    if (tab === 'active' && statusChip) list = list.filter((d) => d.status === statusChip);
    return list.filter((d) => matchesSearch(d, search));
  }, [dispatches, tab, statusChip, search]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      <Header title="Jobs" />

      <View className="gap-3 px-4 pb-3">
        <View className="flex-row items-center gap-2 rounded-lg border border-border bg-secondary px-3">
          <Search color={colors.mutedForeground} size={16} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search dispatch, customer, city…"
            placeholderTextColor={colors.mutedForeground}
            className="h-11 flex-1 text-sm text-foreground"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} accessibilityLabel="Clear search">
              <X color={colors.mutedForeground} size={16} />
            </Pressable>
          )}
        </View>

        <View className="flex-row gap-2">
          {TABS.map(({ id, label }) => (
            <Pressable
              key={id}
              onPress={() => {
                setTab(id);
                setStatusChip(null);
              }}
              className={cn('flex-1 items-center rounded-full px-3 py-1.5', tab === id ? 'bg-primary' : 'bg-secondary')}
            >
              <Text
                className={cn('text-xs font-semibold', tab === id ? 'text-primary-foreground' : 'text-secondary-foreground')}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'active' && (
          <View className="flex-row flex-wrap gap-2">
            {ACTIVE_STATUSES.map((status) => (
              <Pressable
                key={status}
                onPress={() => setStatusChip((current) => (current === status ? null : status))}
                className={cn(
                  'rounded-full border px-2.5 py-1',
                  statusChip === status ? 'border-primary bg-primary/15' : 'border-border bg-transparent',
                )}
              >
                <Text className={cn('text-xs font-medium', statusChip === status ? 'text-primary' : 'text-muted-foreground')}>
                  {statusLabel(status)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {dispatchesQuery.isPending ? (
        <View className="gap-3 px-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </View>
      ) : dispatchesQuery.isError ? (
        <ErrorState
          description={describeError(dispatchesQuery.error, 'Failed to load your jobs')}
          onRetry={() => dispatchesQuery.refetch()}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 px-4 pb-6"
          renderItem={({ item }) => <ExpandableJobCard dispatch={item} />}
          refreshControl={
            <RefreshControl
              refreshing={dispatchesQuery.isRefetching}
              onRefresh={() => dispatchesQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={search ? 'No matches' : 'Nothing here'}
              description={
                search
                  ? `No jobs match "${search}" in this view.`
                  : tab === 'today'
                    ? 'No jobs scheduled for today.'
                    : tab === 'active'
                      ? "You're all caught up — new dispatches will show up here."
                      : tab === 'completed'
                        ? 'Delivered jobs will appear here.'
                        : 'Cancelled jobs will appear here.'
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
