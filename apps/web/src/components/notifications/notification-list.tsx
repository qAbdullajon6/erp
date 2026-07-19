import { Checkbox } from "@/components/ui/checkbox";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { NotificationItem } from "./notification-item";
import {
  useMarkAsRead,
  useMarkAsUnread,
  useArchiveNotification,
  type Notification,
  type NotificationPagination,
} from "@/lib/api/notification-center";

interface NotificationListProps {
  notifications: Notification[];
  selectedIds: Set<string>;
  onSelectAll: () => void;
  onToggleSelect: (id: string) => void;
  pagination?: NotificationPagination;
  onPageChange: (page: number) => void;
}

export function NotificationList({
  notifications,
  selectedIds,
  onSelectAll,
  onToggleSelect,
  pagination,
  onPageChange,
}: NotificationListProps) {
  const markRead = useMarkAsRead();
  const markUnread = useMarkAsUnread();
  const archive = useArchiveNotification();
  const busy = markRead.isPending || markUnread.isPending || archive.isPending;

  const allSelected = notifications.length > 0 && selectedIds.size === notifications.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-t-lg border border-b-0 bg-surface px-4 py-3">
        <Checkbox checked={allSelected} onCheckedChange={onSelectAll} aria-label="Select all notifications" />
        <span className="text-sm text-muted-foreground">
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
        </span>
      </div>

      <div className="space-y-2 rounded-b-lg border border-t-0 p-2">
        {notifications.map((notification) => (
          <div key={notification.id} className="flex items-start gap-3">
            <Checkbox
              className="mt-4"
              checked={selectedIds.has(notification.id)}
              onCheckedChange={() => onToggleSelect(notification.id)}
              aria-label={`Select notification: ${notification.title}`}
            />
            <div className="min-w-0 flex-1">
              <NotificationItem
                notification={notification}
                onMarkRead={(id) => markRead.mutate(id)}
                onMarkUnread={(id) => markUnread.mutate(id)}
                onArchive={(id) => archive.mutate(id)}
                busy={busy}
              />
            </div>
          </div>
        ))}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <PaginationBar
          page={pagination.page}
          total={pagination.total}
          totalPages={pagination.totalPages}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
