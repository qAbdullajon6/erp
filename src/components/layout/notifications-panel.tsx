"use client";

import Link from "next/link";
import { AlertTriangle, Bell, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getNotifications, type NotificationSeverity } from "@/lib/notifications";
import { useAppData } from "@/lib/store";
import { cn } from "@/lib/utils";

const severityIconClass: Record<NotificationSeverity, string> = {
  critical: "text-destructive",
  warning: "text-chart-3",
  info: "text-chart-5",
};

export function NotificationsPanel() {
  const { orders, drivers, vehicles, invoices } = useAppData();
  const notifications = getNotifications({ orders, drivers, vehicles, invoices });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9">
          <Bell className="size-4" />
          {notifications.length > 0 && (
            <Badge className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full p-0 text-[10px]">
              {notifications.length > 9 ? "9+" : notifications.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 && (
          <p className="px-1.5 py-3 text-center text-sm text-muted-foreground">
            You&apos;re all caught up.
          </p>
        )}
        <div className="space-y-1">
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              className="flex items-start gap-2 rounded-md p-1.5 text-sm hover:bg-accent"
            >
              {n.severity === "info" ? (
                <Info className={cn("mt-0.5 size-4 shrink-0", severityIconClass[n.severity])} />
              ) : (
                <AlertTriangle
                  className={cn("mt-0.5 size-4 shrink-0", severityIconClass[n.severity])}
                />
              )}
              <div className="min-w-0">
                <p className="font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
