import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useNotificationsQuery,
  useMarkReadMutation,
  useMarkUnreadMutation,
  useArchiveMutation,
  useMarkAllReadMutation,
  useArchiveAllMutation,
  type NotificationCategory,
  type NotificationSeverity,
} from '@/lib/api/notifications';
import { NotificationItem } from './notification-item';

const CATEGORY_OPTIONS: NotificationCategory[] = ['OPERATIONS', 'FINANCE', 'CUSTOMERS', 'FLEET'];
const SEVERITY_OPTIONS: NotificationSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function NotificationsList() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<NotificationCategory | ''>('');
  const [severity, setSeverity] = useState<NotificationSeverity | ''>('');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [archivedFilter, setArchivedFilter] = useState<'active' | 'archived'>('active');

  const { data, isLoading, isError, error, refetch } = useNotificationsQuery({
    page,
    limit: 20,
    category: category || undefined,
    severity: severity || undefined,
    isRead: readFilter === 'all' ? undefined : readFilter === 'read',
    isArchived: archivedFilter === 'archived',
  });

  const { mutate: markRead, isPending: marking } = useMarkReadMutation();
  const { mutate: markUnread, isPending: unmarking } = useMarkUnreadMutation();
  const { mutate: archive, isPending: archiving } = useArchiveMutation();
  const { mutateAsync: markAllRead, isPending: markingAll } = useMarkAllReadMutation();
  const { mutateAsync: archiveAll, isPending: archivingAll } = useArchiveAllMutation();

  const handleMarkRead = (id: string) => markRead(id, { onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to mark as read') });
  const handleMarkUnread = (id: string) => markUnread(id, { onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to mark as unread') });
  const handleArchive = (id: string) => archive(id, { onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to archive') });

  const handleMarkAllRead = async () => {
    try {
      const result = await markAllRead();
      toast.success(`Marked ${result.updatedCount} notification${result.updatedCount === 1 ? '' : 's'} as read`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark all as read');
    }
  };

  const handleArchiveAll = async () => {
    try {
      const result = await archiveAll();
      toast.success(`Archived ${result.updatedCount} notification${result.updatedCount === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive all');
    }
  };

  const busy = marking || unmarking || archiving;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-lg border border-brand/10 bg-surface p-4 sm:grid-cols-4">
        <div>
          <label className="text-sm font-medium text-foreground">Category</label>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as NotificationCategory | '');
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All Categories</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Severity</label>
          <select
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value as NotificationSeverity | '');
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All Severities</option>
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Status</label>
          <select
            value={readFilter}
            onChange={(e) => {
              setReadFilter(e.target.value as 'all' | 'unread' | 'read');
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Archive</label>
          <select
            value={archivedFilter}
            onChange={(e) => {
              setArchivedFilter(e.target.value as 'active' | 'archived');
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Loading...' : isError ? 'Error loading notifications' : `${data?.meta.total ?? 0} notifications`}
          {!isLoading && !isError && data && ` · ${data.unreadCount} unread`}
        </p>
        {archivedFilter === 'active' && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleMarkAllRead} disabled={markingAll}>
              Mark all as read
            </Button>
            <Button size="sm" variant="outline" onClick={handleArchiveAll} disabled={archivingAll}>
              Archive all
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load notifications'}
            <button onClick={() => refetch()} className="ml-2 font-semibold underline hover:no-underline">
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
          <div className="rounded-lg border border-brand/10 py-12 text-center text-sm text-muted-foreground">
            {archivedFilter === 'archived' ? 'No archived notifications' : "You're all caught up."}
          </div>
        )}

        {!isLoading &&
          data?.items.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onMarkRead={handleMarkRead}
              onMarkUnread={handleMarkUnread}
              onArchive={handleArchive}
              busy={busy}
            />
          ))}
      </div>

      {!isLoading && (data?.items.length ?? 0) > 0 && (data?.meta.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-brand/10 bg-surface p-4">
          <div className="text-sm text-muted-foreground">
            Page {data!.meta.page} of {data!.meta.totalPages} ({data!.meta.total} total)
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} variant="outline" size="sm">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => setPage((p) => Math.min(data!.meta.totalPages, p + 1))}
              disabled={page === data!.meta.totalPages}
              variant="outline"
              size="sm"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
