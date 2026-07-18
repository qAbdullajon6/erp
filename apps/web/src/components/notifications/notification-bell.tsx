import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Bell, BellOff, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/list-states';
import { useCurrentUser } from '@/lib/api/auth';
import {
  useUnreadCountQuery,
  useNotificationsQuery,
  useMarkReadMutation,
  useMarkUnreadMutation,
  useArchiveMutation,
  useMarkAllReadMutation,
} from '@/lib/api/notifications';
import { NotificationItem } from './notification-item';

/// DRIVER has no @Roles entry on NotificationsController at all — every
/// route 403s for it. The bell must not fire any notification request for
/// that role, not just hide the badge visually.
const NOTIFICATIONS_VISIBLE_ROLES = new Set([
  'ADMIN',
  'OPERATIONS_MANAGER',
  'DISPATCHER',
  'ACCOUNTANT',
  'SALES_CRM_MANAGER',
]);

/// The panel is a preview, not the archive — /app/notifications is. Ten rows is
/// about a screenful; beyond that the "View all" link is the better answer.
const PREVIEW_LIMIT = 10;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: currentUser } = useCurrentUser();
  const visible = !!currentUser && NOTIFICATIONS_VISIBLE_ROLES.has(currentUser.membership.role);

  const { data: unread } = useUnreadCountQuery(visible);
  const { data, isLoading, isError, error, refetch } = useNotificationsQuery(
    { limit: PREVIEW_LIMIT, isArchived: false, sortBy: 'createdAt', sortOrder: 'desc' },
    visible && open,
  );

  const { mutate: markRead, isPending: marking } = useMarkReadMutation();
  const { mutate: markUnread, isPending: unmarking } = useMarkUnreadMutation();
  const { mutate: archive, isPending: archiving } = useArchiveMutation();
  const { mutate: markAllRead, isPending: markingAll } = useMarkAllReadMutation();

  if (!visible) return null;

  const unreadCount = unread?.unreadCount ?? 0;
  const items = data?.items ?? [];
  const busy = marking || unmarking || archiving;

  const onError = (fallback: string) => (err: unknown) =>
    toast.error(err instanceof Error ? err.message : fallback);

  const handleMarkRead = (id: string) => markRead(id, { onError: onError('Failed to mark as read') });
  const handleMarkUnread = (id: string) => markUnread(id, { onError: onError('Failed to mark as unread') });
  const handleArchive = (id: string) => archive(id, { onError: onError('Failed to archive') });
  const handleMarkAllRead = () =>
    markAllRead(undefined, {
      onSuccess: () => toast.success('All notifications marked as read'),
      onError: onError('Failed to mark all as read'),
    });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-brand/10 hover:text-brand"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* p-0 so the scroll region can run edge to edge; the header and footer
          keep their own padding and stay pinned while the list scrolls. */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          {/* pr-14 keeps "Mark all read" clear of SheetContent's own close
              button, which is absolutely positioned at right-4 top-4. */}
          <div className="flex items-center justify-between gap-4 border-b border-brand/10 py-5 pl-6 pr-14">
            <div className="flex items-center gap-2.5">
              <SheetTitle className="text-lg font-semibold">Notifications</SheetTitle>
              {unreadCount > 0 && <Badge variant="danger">{unreadCount} unread</Badge>}
            </div>

            {unreadCount > 0 && (
              <Button
                onClick={handleMarkAllRead}
                disabled={markingAll}
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="h-4 w-4" />
                {markingAll ? 'Marking…' : 'Mark all read'}
              </Button>
            )}
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin px-4 py-4">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}

            {isError && !isLoading && (
              <ErrorState
                message={error instanceof Error ? error.message : 'Failed to load notifications'}
                onRetry={() => refetch()}
              />
            )}

            {!isLoading && !isError && items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="rounded-full bg-muted p-3">
                  <BellOff className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mt-4 font-medium text-foreground">You're all caught up</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Delays, overdue invoices, and fleet alerts land here.
                </p>
              </div>
            )}

            {!isLoading &&
              !isError &&
              items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={handleMarkRead}
                  onMarkUnread={handleMarkUnread}
                  onArchive={handleArchive}
                  onNavigate={() => setOpen(false)}
                  busy={busy}
                />
              ))}
          </div>

          <div className="border-t border-brand/10 px-6 py-4">
            <Link
              to="/app/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/10"
            >
              View all notifications
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
