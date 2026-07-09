import { Link } from "@tanstack/react-router";
import { Truck } from "lucide-react";

interface DriverDashboardSummaryProps {
  firstName?: string;
}

export function DriverDashboardSummary({ firstName }: DriverDashboardSummaryProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </h1>
        <p className="mt-2 text-muted-foreground">Here's a quick look at your work today.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Truck className="h-7 w-7" />
        </div>
        <h2 className="mt-4 font-display text-xl font-bold text-foreground">Your deliveries</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          View today's assigned pickups and deliveries, and update their status as you go.
        </p>
        <Link
          to="/app/my-deliveries"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
        >
          Go to My Deliveries
        </Link>
      </div>
    </div>
  );
}
