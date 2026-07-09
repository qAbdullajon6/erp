import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import type { Notification } from '@/lib/api/notifications';
import { getEntityLink } from '@/lib/notification-links';
import { formatRelativeTime } from '@/lib/format';

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onArchive: (id: string) => void;
  busy?: boolean;
}

const SEVERITY_DOT: Record<Notification['severity'], string> = {
  CRITICAL: 'bg-destructive',
  HIGH: 'bg-destructive',
  MEDIUM: 'bg-warning',
  LOW: 'bg-muted-foreground',
};

const CATEGORY_LABEL: Record<Notification['category'], string> = {
  OPERATIONS: 'Operations',
  FINANCE: 'Finance',
  CUSTOMERS: 'Customers',
  FLEET: 'Fleet',
};

export function NotificationItem({ notification, onMarkRead, onMarkUnread, onArchive, busy }: NotificationItemProps) {
  const entityLink = getEntityLink(notification.entityType, notification.entityId);

  return (
    <div
      className={`rounded-lg border px-4 py-3 transition-colors ${
        notification.isRead ? 'border-brand/5 bg-transparent' : 'border-brand/10 bg-background/60'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[notification.severity]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`text-sm ${notification.isRead ? 'text-muted-foreground' : 'font-semibold text-foreground'}`}>
              {notification.title}
            </p>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{notification.message}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{CATEGORY_LABEL[notification.category]}</span>
            <span>·</span>
            <span>{formatRelativeTime(notification.createdAt)}</span>
            {entityLink && (
              <>
                <span>·</span>
                <Link to={entityLink.to} params={entityLink.params} className="font-medium text-brand hover:underline">
                  {entityLink.label}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        {notification.isRead ? (
          <Button size="sm" variant="ghost" onClick={() => onMarkUnread(notification.id)} disabled={busy} className="h-7 px-2 text-xs">
            Mark unread
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => onMarkRead(notification.id)} disabled={busy} className="h-7 px-2 text-xs">
            Mark read
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onArchive(notification.id)} disabled={busy} className="h-7 px-2 text-xs">
          Archive
        </Button>
      </div>
    </div>
  );
}
