"use client";

import Link from "next/link";
import { Archive, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/mock-data";
import { notificationCategoryMeta, notificationPriorityMeta } from "@/lib/status-meta";
import type { AppNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export function NotificationRow({
  notification,
  read,
  onMarkRead,
  onArchive,
}: {
  notification: AppNotification;
  read: boolean;
  onMarkRead: () => void;
  onArchive: () => void;
}) {
  const priorityMeta = notificationPriorityMeta[notification.priority];
  const categoryMeta = notificationCategoryMeta[notification.category];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border p-3",
        !read && "bg-accent/40",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={notification.href} className="text-sm font-medium hover:underline">
            {notification.title}
          </Link>
          {!read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{notification.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">{notification.recommendedAction}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={priorityMeta.badgeClass}>
            {priorityMeta.label}
          </Badge>
          <Badge variant="outline">{categoryMeta.label}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(notification.at)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        {!read && (
          <Button variant="ghost" size="icon" className="size-7" onClick={onMarkRead}>
            <Check className="size-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-7" onClick={onArchive}>
          <Archive className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
