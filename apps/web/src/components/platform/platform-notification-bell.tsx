'use client';

import { useState } from 'react';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/list-states';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatRelativeTime } from '@/lib/format';
import {
  usePlatformNotificationsQuery,
  useMarkPlatformNotificationReadMutation,
  useMarkAllPlatformNotificationsReadMutation,
} from '@/lib/api/platform';
import { cn } from '@/lib/utils';

export function PlatformNotificationBell() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, error, refetch } = usePlatformNotificationsQuery(true);
  const { mutate: markRead, isPending: marking } = useMarkPlatformNotificationReadMutation();
  const { mutate: markAllRead, isPending: markingAll } = useMarkAllPlatformNotificationsReadMutation();

  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  const handleMarkRead = (id: string) =>
    markRead(id, {
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to mark as read'),
    });

  const handleMarkAllRead = () =>
    markAllRead(undefined, {
      onSuccess: () => toast.success('All notifications marked as read'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to mark all as read'),
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <div className="flex items-center justify-between gap-4 border-b border-brand/10 py-5 pl-6 pr-14">
            <div className="flex items-center gap-2.5">
              <SheetTitle className="text-lg font-semibold">Platform alerts</SheetTitle>
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
            {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}

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
                <p className="mt-4 font-medium text-foreground">You&apos;re all caught up</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Suspended orgs, failed payments, and lead conversions land here.
                </p>
              </div>
            )}

            {!isLoading &&
              !isError &&
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  disabled={marking || n.isRead}
                  onClick={() => handleMarkRead(n.id)}
                  className={cn(
                    'w-full rounded-xl border border-brand/10 p-4 text-left transition-colors hover:bg-muted/50',
                    !n.isRead && 'bg-brand/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <StatusBadge status={n.severity} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatRelativeTime(n.createdAt)}</p>
                </button>
              ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
