"use client";

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
import { getNotifications } from "@/lib/notifications";
import { useNotificationSettings } from "@/lib/notification-settings";
import { useNotificationState } from "@/lib/notification-state";
import { useAppData } from "@/lib/store";

export function NotificationsPanel() {
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
