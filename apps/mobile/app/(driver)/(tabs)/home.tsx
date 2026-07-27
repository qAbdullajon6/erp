import { useRef } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { CalendarClock, PackageCheck, Truck } from 'lucide-react-native';
import { Avatar, EmptyState, ErrorState, Section, Skeleton, StatCard } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { describeError } from '@/services/api/describe-error';
import { useMyDispatchesQuery, useMyDriverProfileQuery } from '@/services/api/endpoints/driver';
import { JobCard } from '@/features/jobs/components/job-card';
import { QuickActions } from '@/features/jobs/components/quick-actions';
import { StatusActionSheet } from '@/features/jobs/components/status-action-sheet';
import { ActiveDispatchCard } from '@/features/home/components/active-dispatch-card';
import { GpsStatusCard } from '@/features/tracking/components/gps-status-card';

function isToday(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  );
}

export default function HomeScreen() {
  const profileQuery = useMyDriverProfileQuery();
  const dispatchesQuery = useMyDispatchesQuery(false);
  const sheetRef = useRef<BottomSheetModal>(null);

  const dispatches = dispatchesQuery.data ?? [];
  const todaysJobs = dispatches.filter((d) => isToday(d.pickupDateScheduled));
  const inProgress = dispatches.filter((d) => d.status !== 'ASSIGNED').length;
  const activeJob = dispatches[0];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      <ScrollView
        contentContainerClassName="gap-6 px-4 pb-8 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={dispatchesQuery.isRefetching || profileQuery.isRefetching}
            onRefresh={() => {
              void dispatchesQuery.refetch();
              void profileQuery.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View className="flex-row items-center gap-3">
          {profileQuery.data && <Avatar firstName={profileQuery.data.firstName} lastName={profileQuery.data.lastName} />}
          <View className="flex-1">
            <Text className="text-sm text-muted-foreground">Welcome back</Text>
            <Text className="font-display text-xl font-bold text-foreground">
              {profileQuery.data ? `${profileQuery.data.firstName} ${profileQuery.data.lastName}` : ' '}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          <StatCard
            label="Today"
            value={String(todaysJobs.length)}
            icon={<CalendarClock color={colors.mutedForeground} size={16} />}
          />
          <StatCard
            label="In progress"
            value={String(inProgress)}
            icon={<Truck color={colors.mutedForeground} size={16} />}
          />
          <StatCard
            label="On your plate"
            value={String(dispatches.length)}
            icon={<PackageCheck color={colors.mutedForeground} size={16} />}
          />
        </View>

        <GpsStatusCard />

        {dispatchesQuery.isPending ? (
          <Skeleton className="h-56" />
        ) : dispatchesQuery.isError ? (
          <ErrorState
            description={describeError(dispatchesQuery.error, 'Failed to load your jobs')}
            onRetry={() => dispatchesQuery.refetch()}
          />
        ) : activeJob ? (
          <>
            <Section title="Active job">
              <ActiveDispatchCard dispatch={activeJob} />
            </Section>
            <Section title="Quick actions">
              <QuickActions dispatch={activeJob} onUpdateStatus={() => sheetRef.current?.present()} />
            </Section>
            <StatusActionSheet
              ref={sheetRef}
              dispatchId={activeJob.id}
              dispatchNumber={activeJob.dispatchNumber}
              allowedTransitions={activeJob.allowedTransitions}
            />
          </>
        ) : (
          <EmptyState
            icon={<Truck color={colors.mutedForeground} size={28} />}
            title="No active job"
            description="Dispatch will assign your next job here."
          />
        )}

        {todaysJobs.length > 1 && (
          <Section title={`Today's jobs (${todaysJobs.length})`}>
            <View className="gap-3">
              {todaysJobs
                .filter((dispatch) => dispatch.id !== activeJob?.id)
                .map((dispatch) => (
                  <JobCard key={dispatch.id} dispatch={dispatch} />
                ))}
            </View>
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
