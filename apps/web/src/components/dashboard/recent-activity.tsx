import {
  ClipboardList,
  FileText,
  Radio,
  Wallet,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardActivityItem, DashboardActivityKind } from "@/lib/api/dashboard";

interface RecentActivityProps {
  items: DashboardActivityItem[] | null | undefined;
  loading: boolean;
}

const KIND_ICON: Record<DashboardActivityKind, typeof ClipboardList> = {
  order: ClipboardList,
  dispatch: Radio,
  invoice: FileText,
  payment: Wallet,
};

export function RecentActivity({ items, loading }: RecentActivityProps) {
  if (loading) return <Skeleton className="h-56 w-full rounded-xl" />;

  const feed = items ?? [];

  return (
    <SurfaceCard>
      <SurfaceCardHeader className="py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
          <p className="text-[11px] text-muted-foreground">Latest orders, dispatches, invoices, and payments</p>
        </div>
      </SurfaceCardHeader>

      {feed.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">No recent activity yet.</p>
      ) : (
        <ul className="max-h-64 space-y-0.5 overflow-y-auto px-2 pb-2 scrollbar-thin">
          {feed.map((item, index) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li
                key={`${item.kind}-${item.at}-${index}`}
                className="flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-muted/40"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground">{formatRelativeTime(item.at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SurfaceCard>
  );
}
