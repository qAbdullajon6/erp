import { Link } from '@tanstack/react-router';
import { Archive, ArrowRight, Check, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Notification } from '@/lib/api/notifications';
import { getEntityLink } from '@/lib/notification-links';
import { formatRelativeTime } from '@/lib/format';

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onArchive: (id: string) => void;
  /// Lets the bell's slide-over close itself when the user follows a link out.
  onNavigate?: () => void;
  busy?: boolean;
}

/// Severity never travels as colour alone: each level ships a word as well as
/// a hue, so the ranking survives colour-blindness and forced-colours mode.
const SEVERITY: Record<Notification['severity'], { label: string; badge: 'danger' | 'warning' | 'muted'; bar: string }> =
  {
    CRITICAL: { label: 'Critical', badge: 'danger', bar: 'bg-destructive' },
    HIGH: { label: 'High', badge: 'danger', bar: 'bg-destructive' },
    MEDIUM: { label: 'Medium', badge: 'warning', bar: 'bg-warning' },
    LOW: { label: 'Low', badge: 'muted', bar: 'bg-muted-foreground' },
  };

const CATEGORY_LABEL: Record<Notification['category'], string> = {
  OPERATIONS: 'Operations',
  FINANCE: 'Finance',
  CUSTOMERS: 'Customers',
  FLEET: 'Fleet',
};

export function NotificationItem({
  notification,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onNavigate,
  busy,
}: NotificationItemProps) {
  const entityLink = getEntityLink(notification.entityType, notification.entityId);
  const severity = SEVERITY[notification.severity];
  const unread = !notification.isRead;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border pl-5 pr-3 py-3 transition-colors ${
        unread ? 'border-brand/15 bg-background/60' : 'border-brand/5 bg-transparent hover:bg-background/30'
      }`}
    >
      {/* A severity bar rather than a dot: it reads at a glance down a long
          list, and the unread state is carried by weight and background too. */}
      <span
        className={`absolute inset-y-0 left-0 w-1 ${unread ? severity.bar : 'bg-transparent'}`}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${unread ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
            {notification.title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{notification.message}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={severity.badge}>{severity.label}</Badge>
            <span>{CATEGORY_LABEL[notification.category]}</span>
            <span aria-hidden>·</span>
            <span>{formatRelativeTime(notification.createdAt)}</span>
          </div>

          {entityLink && (
            <Link
              to={entityLink.to}
              params={entityLink.params}
              onClick={onNavigate}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              {entityLink.label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        {/* Row actions sit out of the way until the row is hovered or focused,
            so a long list reads as content rather than as buttons. On touch
            there is no hover, so they stay visible below the sm breakpoint. */}
        <div className="flex shrink-0 gap-1 transition-opacity sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
          {unread ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onMarkRead(notification.id)}
              disabled={busy}
              className="h-8 w-8 p-0"
              aria-label="Mark as read"
              title="Mark as read"
            >
              <Check className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onMarkUnread(notification.id)}
              disabled={busy}
              className="h-8 w-8 p-0"
              aria-label="Mark as unread"
              title="Mark as unread"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => onArchive(notification.id)}
            disabled={busy}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            aria-label="Archive"
            title="Archive"
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
