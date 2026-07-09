import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Truck } from 'lucide-react';
import { useCurrentUser } from '@/lib/api/auth';
import { useMyDriverProfileQuery, useMyDeliveriesQuery, type MyDelivery } from '@/lib/api/my-deliveries';
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
    return <Skeleton className="h-96 rounded-lg" />;
  }

  if (userError || !currentUser) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {userError || 'Failed to load your account'}
        <Button onClick={() => refetchUser()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  if (!isDriver) {
    return (
      <div className="rounded-lg border border-brand/10 bg-surface p-8 text-center text-sm text-muted-foreground">
        My Deliveries is only available for the Driver role.
      </div>
    );
  }

  if (selectedId) {
    return <DeliveryDetail deliveryId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (profileLoading) {
    return <Skeleton className="h-96 rounded-lg" />;
  }

  if (profileError) {
    return (
      <div className="rounded-lg border border-warning/20 bg-warning/5 p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          {profileErrorObj instanceof Error ? profileErrorObj.message : 'No driver profile is linked to your account yet'}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask an admin or dispatcher to link your account to a driver profile.
        </p>
      </div>
    );
  }

  const buckets = { active: [] as MyDelivery[], upcoming: [] as MyDelivery[], completed: [] as MyDelivery[] };
  for (const d of deliveries ?? []) {
    if (d.status === 'DELIVERED' || d.status === 'CANCELLED') {
      buckets.completed.push(d);
    } else if (d.isDelayed || isToday(d.deliveryDate)) {
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
          {driverProfile ? `Welcome, ${driverProfile.firstName}` : 'My Deliveries'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Your assigned pickups and deliveries</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load deliveries'}
          <button onClick={() => refetch()} className="ml-2 font-semibold underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && totalCount === 0 && (
        <div className="rounded-xl border border-brand/10 bg-surface p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Truck className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium text-foreground">No deliveries assigned yet</p>
          <p className="mt-1 text-sm text-muted-foreground">New assignments from dispatch will show up here.</p>
        </div>
      )}

      {!isLoading && !isError && buckets.active.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Today / Active</h2>
          <div className="space-y-3">
            {buckets.active.map((d) => (
              <DeliveryCard key={d.id} delivery={d} onClick={() => setSelectedId(d.id)} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && !isError && buckets.upcoming.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h2>
          <div className="space-y-3">
            {buckets.upcoming.map((d) => (
              <DeliveryCard key={d.id} delivery={d} onClick={() => setSelectedId(d.id)} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && !isError && buckets.completed.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Completed</h2>
          <div className="space-y-3">
            {buckets.completed.map((d) => (
              <DeliveryCard key={d.id} delivery={d} onClick={() => setSelectedId(d.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
