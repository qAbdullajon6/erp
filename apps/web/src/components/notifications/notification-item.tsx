import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Archive, ArrowRight, Check, ChevronDown, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Notification } from '@/lib/api/notifications';
import { getEntityLink } from '@/lib/notification-links';
import { formatDateTime, formatRelativeTime } from '@/lib/format';

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
  BILLING: 'Billing',
  SUPPORT: 'Support',
};

export function NotificationItem({
  notification,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onNavigate,
  busy,
}: NotificationItemProps) {
  const [expanded, setExpanded] = useState(false);
  const entityLink = getEntityLink(notification.entityType, notification.entityId);
  const severity = SEVERITY[notification.severity];
  const unread = !notification.isRead;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border transition-colors ${
        unread ? 'border-brand/15 bg-background/60' : 'border-brand/5 bg-transparent hover:bg-background/30'
      }`}
    >
      {/* A severity bar rather than a dot: it reads at a glance down a long
          list, and the unread state is carried by weight and background too. */}
      <span
        className={`absolute inset-y-0 left-0 w-1 ${unread ? severity.bar : 'bg-transparent'}`}
        aria-hidden
      />

      {/* Clicking the row itself expands the detail region beneath it — the
          gesture the whole list shares. The header stays a real <button> so it
          is keyboard-operable and announces its state via aria-expanded; the
          expanded body lives OUTSIDE this button because it contains links
          and action buttons of its own (no nested interactive elements). */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="block w-full py-3 pl-5 pr-3 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <p className={`text-sm ${unread ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
            {notification.title}
          </p>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{formatRelativeTime(notification.createdAt)}</span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                expanded ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </span>
        </div>

        {/* Collapsed shows a single-line preview; the full message is revealed
            by the expansion, so the collapsed list scans fast. */}
        {!expanded && (
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{notification.message}</p>
        )}
      </button>

      {/* The grid-rows 0fr→1fr trick animates height without measuring:
          the inner wrapper clips, the outer track stretches. */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          {expanded && (
            <div className="border-t border-brand/10 pb-3 pl-5 pr-3 pt-3">
              <p className="text-sm leading-relaxed text-muted-foreground">{notification.message}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={severity.badge}>{severity.label}</Badge>
                <span>{CATEGORY_LABEL[notification.category]}</span>
                <span aria-hidden>·</span>
                <span>{formatDateTime(notification.createdAt)}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {entityLink && (
                  <Link
                    to={entityLink.to}
                    params={entityLink.params}
                    search={entityLink.search}
                    onClick={onNavigate}
                    className="inline-flex items-center gap-1 rounded-lg border border-brand/20 bg-brand/5 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
                  >
                    {entityLink.label}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}

                {unread ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onMarkRead(notification.id)}
                    disabled={busy}
                    className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark as read
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onMarkUnread(notification.id)}
                    disabled={busy}
                    className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Mark as unread
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onArchive(notification.id)}
                  disabled={busy}
                  className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
