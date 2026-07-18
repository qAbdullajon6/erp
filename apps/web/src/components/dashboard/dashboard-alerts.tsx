import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import {
  useNotificationsQuery,
  useMarkReadMutation,
  useMarkUnreadMutation,
  useArchiveMutation,
} from "@/lib/api/notifications";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";
import { SectionHeader } from "@/components/ui/section-header";
import { toast } from "sonner";

/// Reuses the exact same query/mutations/row component as the notification
/// bell — an "Alerts" widget is just the unread, most-severe slice of the
/// same data, not a separate concept with its own fetch.
export function DashboardAlerts({ enabled }: { enabled: boolean }) {
  const { data, isLoading } = useNotificationsQuery(
    { isRead: false, isArchived: false, sortBy: "severity", sortOrder: "desc", limit: 5 },
    enabled,
  );
  const { mutate: markRead, isPending: marking } = useMarkReadMutation();
  const { mutate: markUnread, isPending: unmarking } = useMarkUnreadMutation();
  const { mutate: archive, isPending: archiving } = useArchiveMutation();

  const onError = (message: string) => () => toast.error(message);
  const busy = marking || unmarking || archiving;

  const items = data?.items ?? [];

  return (
    <SurfaceCard className="flex h-full flex-col">
      <SurfaceCardHeader>
        <SectionHeader title="Alerts" subtitle="Unread, most severe first" />
        {!enabled ? null : (
          <Link
            to="/app/notifications"
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </SurfaceCardHeader>

      <div className="max-h-80 flex-1 space-y-2 overflow-y-auto scrollbar-thin p-4">
        {!enabled && (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            Alerts aren't available for your role.
          </p>
        )}

        {enabled && isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}

        {enabled && !isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-success/10 p-3">
              <ShieldCheck className="h-5 w-5 text-success" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">Nothing needs attention right now</p>
          </div>
        )}

        {enabled &&
          items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkRead={(id) => markRead(id, { onError: onError("Failed to mark as read") })}
              onMarkUnread={(id) => markUnread(id, { onError: onError("Failed to mark as unread") })}
              onArchive={(id) => archive(id, { onError: onError("Failed to archive") })}
              busy={busy}
            />
          ))}
      </div>
    </SurfaceCard>
  );
}
