import { Link } from "@tanstack/react-router";
import { MapPinned, PackageCheck, Truck } from "lucide-react";
import { useMyDeliveriesQuery, useMyDriverProfileQuery } from "@/lib/api/my-deliveries";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/list-states";

interface DriverDashboardSummaryProps {
  firstName?: string;
}

const ACTIVE = new Set(["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"]);

export function DriverDashboardSummary({ firstName }: DriverDashboardSummaryProps) {
  const profile = useMyDriverProfileQuery(true);
  const deliveries = useMyDeliveriesQuery(!!profile.data);

  if (profile.isLoading) {
    return <LoadingState label="Loading your jobs…" />;
  }

  if (profile.isError) {
    return (
      <ErrorState
        message={
          profile.error instanceof Error
            ? profile.error.message
            : "No driver profile is linked to your account yet. Ask an admin to link your login on the Drivers screen."
        }
      />
    );
  }

  const items = deliveries.data ?? [];
  const activeCount = items.filter((d) => ACTIVE.has(d.status)).length;
  const nextJob = items.find((d) => ACTIVE.has(d.status)) ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {firstName ? `Hi, ${firstName}` : "Driver home"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Your jobs for today</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active jobs</p>
          <p className="mt-2 font-display text-3xl font-bold text-foreground">
            {deliveries.isLoading ? "—" : activeCount}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assigned total</p>
          <p className="mt-2 font-display text-3xl font-bold text-foreground">
            {deliveries.isLoading ? "—" : items.length}
          </p>
        </div>
      </div>

      {deliveries.isError ? (
        <ErrorState
          message={deliveries.error instanceof Error ? deliveries.error.message : "Failed to load jobs"}
          onRetry={() => void deliveries.refetch()}
        />
      ) : null}

      {!deliveries.isLoading && !deliveries.isError && activeCount === 0 ? (
        <EmptyState
          icon={Truck}
          title="No active jobs"
          description="When dispatch assigns you a trip, it will show up here."
        />
      ) : null}

      {nextJob ? (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next up</p>
              <p className="mt-1 truncate font-semibold text-foreground">{nextJob.dispatchNumber}</p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {nextJob.order.pickupCity} → {nextJob.order.deliveryCity}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{nextJob.customer.companyName}</p>
            </div>
          </div>
          <Link
            to="/app/my-deliveries"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground"
          >
            <MapPinned className="h-4 w-4" />
            Open jobs
          </Link>
        </div>
      ) : (
        <Link
          to="/app/my-deliveries"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground"
        >
          View all jobs
        </Link>
      )}
    </div>
  );
}
