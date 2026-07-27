import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { useCurrentUser } from '@/lib/api/auth';
import { useMyDriverProfileQuery, useMyDeliveriesQuery, type MyDelivery } from '@/lib/api/my-deliveries';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { DeliveryCard } from './delivery-card';
import { DeliveryDetail } from './delivery-detail';

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function MyDeliveriesView() {
  const { data: currentUser, loading: userLoading, error: userError, refetch: refetchUser } = useCurrentUser();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    refetchUser();
  }, [refetchUser]);

  const isDriver = currentUser?.membership.role === 'DRIVER';

  const { data: driverProfile, isLoading: profileLoading, isError: profileError, error: profileErrorObj } =
    useMyDriverProfileQuery(isDriver);
  const { data: deliveries, isLoading, isError, error, refetch } = useMyDeliveriesQuery(isDriver && !!driverProfile);

  if (userLoading) {
    return <LoadingState label="Loading account…" />;
  }

  if (userError || !currentUser) {
    return <ErrorState message={userError || 'Failed to load your account'} onRetry={() => void refetchUser()} />;
  }

  if (!isDriver) {
    return (
      <EmptyState
        title="Drivers only"
        description="My Deliveries is only available for the Driver role."
      />
    );
  }

  if (selectedId) {
    return <DeliveryDetail deliveryId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (profileLoading) {
    return <LoadingState label="Loading your profile…" />;
  }

  if (profileError) {
    return (
      <ErrorState
        message={
          profileErrorObj instanceof Error
            ? profileErrorObj.message
            : 'No driver profile is linked to your account yet. Ask an admin or dispatcher to link your login on Drivers.'
        }
      />
    );
  }

  const IN_PROGRESS = ['EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT'];

  const buckets = { active: [] as MyDelivery[], upcoming: [] as MyDelivery[], completed: [] as MyDelivery[] };
  for (const d of deliveries ?? []) {
    if (d.status === 'DELIVERED' || d.status === 'CANCELLED') {
      buckets.completed.push(d);
    } else if (IN_PROGRESS.includes(d.status) || isToday(d.deliveryDateScheduled)) {
      buckets.active.push(d);
    } else {
      buckets.upcoming.push(d);
    }
  }

  const totalCount = (deliveries ?? []).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {driverProfile ? `Jobs for ${driverProfile.firstName}` : 'My jobs'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Tap a job to navigate, update status, or share GPS</p>
      </div>

      {isLoading ? <LoadingState label="Loading jobs…" /> : null}

      {isError && !isLoading ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load deliveries'}
          onRetry={() => void refetch()}
        />
      ) : null}

      {!isLoading && !isError && totalCount === 0 ? (
        <EmptyState
          icon={Truck}
          title="No jobs yet"
          description="New assignments from dispatch will show up here."
          compact
        />
      ) : null}

      {!isLoading && !isError && buckets.active.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Today / Active</h2>
          <div className="space-y-3">
            {buckets.active.map((d) => (
              <DeliveryCard key={d.id} delivery={d} onClick={() => setSelectedId(d.id)} />
            ))}
          </div>
        </div>
      ) : null}

      {!isLoading && !isError && buckets.upcoming.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h2>
          <div className="space-y-3">
            {buckets.upcoming.map((d) => (
              <DeliveryCard key={d.id} delivery={d} onClick={() => setSelectedId(d.id)} />
            ))}
          </div>
        </div>
      ) : null}

      {!isLoading && !isError && buckets.completed.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Completed</h2>
          <div className="space-y-3">
            {buckets.completed.map((d) => (
              <DeliveryCard key={d.id} delivery={d} onClick={() => setSelectedId(d.id)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
