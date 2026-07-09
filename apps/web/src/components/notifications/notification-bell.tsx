import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/lib/api/auth';
import {
  useUnreadCountQuery,
  useNotificationsQuery,
  useMarkReadMutation,
  useMarkUnreadMutation,
  useArchiveMutation,
} from '@/lib/api/notifications';
import { NotificationItem } from './notification-item';

/// DRIVER has no @Roles entry on NotificationsController at all — every
/// route 403s for it. The bell must not fire any notification request for
/// that role, not just hide the badge visually.
const NOTIFICATIONS_VISIBLE_ROLES = new Set(['ADMIN', 'OPERATIONS_MANAGER', 'DISPATCHER', 'ACCOUNTANT', 'SALES_CRM_MANAGER']);

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: currentUser, fetch: fetchCurrentUser } = useCurrentUser();
  const visible = !!currentUser && NOTIFICATIONS_VISIBLE_ROLES.has(currentUser.membership.role);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const { data: unread } = useUnreadCountQuery(visible);
  const { data, isLoading, isError, error, refetch } = useNotificationsQuery(
    { limit: 5, isArchived: false, sortBy: 'createdAt', sortOrder: 'desc' },
    visible && open,
  );

  const { mutate: markRead, isPending: marking } = useMarkReadMutation();
  const { mutate: markUnread, isPending: unmarking } = useMarkUnreadMutation();
  const { mutate: archive, isPending: archiving } = useArchiveMutation();

  if (!visible) return null;

  const unreadCount = unread?.unreadCount ?? 0;

  const handleMarkRead = (id: string) => markRead(id, { onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to mark as read') });
  const handleMarkUnread = (id: string) => markUnread(id, { onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to mark as unread') });
  const handleArchive = (id: string) => archive(id, { onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to archive') });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-brand/10 hover:text-brand"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-2 overflow-y-auto py-4">
            {isLoading && (
              <>
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
              </>
            )}

            {isError && !isLoading && (
              <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
                {error instanceof Error ? error.message : 'Failed to load notifications'}
                <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-2">
                  Retry
                </Button>
              </div>
            )}

            {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">You're all caught up.</div>
            )}

            {!isLoading &&
              data?.items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={handleMarkRead}
                  onMarkUnread={handleMarkUnread}
                  onArchive={handleArchive}
                  busy={marking || unmarking || archiving}
                />
              ))}
          </div>

          <div className="border-t border-brand/10 pt-4">
            <Link
              to="/app/notifications"
              onClick={() => setOpen(false)}
              className="block rounded-lg py-2 text-center text-sm font-medium text-brand hover:bg-brand/10"
            >
              View all notifications
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
