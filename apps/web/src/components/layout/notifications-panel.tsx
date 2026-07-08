"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDataMode } from "@/lib/data-mode";
import { getNotifications } from "@/lib/notifications";
import { useNotificationSettings } from "@/lib/notification-settings";
import { useNotificationState } from "@/lib/notification-state";
import { useAppData } from "@/lib/store";
import { useApiSession } from "@/lib/api-session";
import { apiClient, type ApiNotification } from "@/lib/api-client";

function NotificationsPanelDemo() {
  const { orders, drivers, vehicles, invoices, customers, expenses } = useAppData();
  const { settings } = useNotificationSettings();
  const { isRead, isArchived } = useNotificationState();

  const all = getNotifications(
    { orders, drivers, vehicles, invoices, customers, expenses },
    settings.thresholds,
  ).filter((n) => settings.categories[n.category] && !isArchived(n.id));

  const unread = all.filter((n) => !isRead(n.id));
  const preview = all.slice(0, 6);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9">
          <Bell className="size-4" />
          {unread.length > 0 && (
            <Badge className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full p-0 text-[10px]">
              {unread.length > 9 ? "9+" : unread.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {preview.length === 0 && (
          <p className="px-1.5 py-3 text-center text-sm text-muted-foreground">
            You&apos;re all caught up.
          </p>
        )}
        <div className="space-y-1">
          {preview.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              className="flex items-start gap-2 rounded-md p-1.5 text-sm hover:bg-accent"
            >
              <AlertTriangle
                className={
                  "mt-0.5 size-4 shrink-0 " +
                  (n.priority === "critical" || n.priority === "high"
                    ? "text-destructive"
                    : "text-chart-3")
                }
              />
              <div className="min-w-0">
                <p className={!isRead(n.id) ? "font-medium" : "text-muted-foreground"}>
                  {n.title}
                </p>
                <p className="text-xs text-muted-foreground">{n.description}</p>
              </div>
            </Link>
          ))}
        </div>
        <DropdownMenuSeparator />
        <Link
          href="/notifications"
          className="block rounded-md p-1.5 text-center text-xs font-medium text-primary hover:underline"
        >
          View all in Notification Center
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationsPanelConnected() {
  const { session, callApi } = useApiSession();
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const fetch = async () => {
      try {
        const [list, count] = await Promise.all([
          callApi((token) =>
            apiClient.listNotifications(token, { limit: 6, isArchived: false, sortOrder: "desc" })
          ),
          callApi((token) => apiClient.getUnreadNotificationCount(token)),
        ]);
        if (!cancelled) {
          setNotifications(list.items);
          setUnreadCount(count.unreadCount);
        }
      } catch (e) {
        // Silent fail, show empty panel
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    Promise.resolve().then(() => { if (!cancelled) fetch(); });
    return () => { cancelled = true; };
  }, [session, callApi]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full p-0 text-[10px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 && (
          <p className="px-1.5 py-3 text-center text-sm text-muted-foreground">
            {loading ? "Loading..." : "You're all caught up."}
          </p>
        )}
        <div className="space-y-1">
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={`/notifications?id=${n.id}`}
              className={`flex items-start gap-2 rounded-md p-1.5 text-sm hover:bg-accent ${n.isRead ? "text-muted-foreground" : "font-medium"}`}
            >
              <AlertTriangle
                className={
                  "mt-0.5 size-4 shrink-0 " +
                  (n.severity === "CRITICAL" || n.severity === "HIGH"
                    ? "text-destructive"
                    : "text-chart-3")
                }
              />
              <div className="min-w-0">
                <p>{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.message}</p>
              </div>
            </Link>
          ))}
        </div>
        <DropdownMenuSeparator />
        <Link
          href="/notifications"
          className="block rounded-md p-1.5 text-center text-xs font-medium text-primary hover:underline"
        >
          View all in Notification Center
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NotificationsPanel() {
  if (getDataMode() !== "api") {
    return <NotificationsPanelDemo />;
  }
  return <NotificationsPanelConnected />;
}
