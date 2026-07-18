import { createFileRoute } from "@tanstack/react-router";
import { usePortalNotificationsList, usePortalMarkRead, usePortalMarkAllRead } from "@/lib/api/portal-notifications";
import { formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCheck, Mail, Package, Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — Customer Portal" }],
  }),
  component: PortalNotificationsPage,
});

function PortalNotificationsPage() {
  const { data, isLoading, isError, refetch } = usePortalNotificationsList(50);
  const markRead = usePortalMarkRead();
  const markAllRead = usePortalMarkAllRead();

  const notifications = data?.items ?? [];

  const handleMarkRead = async (key: string) => {
    try {
      await markRead.mutateAsync(key);
    } catch {
      toast.error("Failed to mark notification as read");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead.mutateAsync();
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Notifications</h1>
          <p className="mt-1 text-muted-foreground">Stay updated on your orders and invoices.</p>
        </div>
        {notifications.some((n) => !n.isRead) && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
            <Bell className="h-12 w-12 text-destructive/40" />
            <p className="text-sm text-destructive">Failed to load notifications.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <button
              key={notification.key}
              onClick={() => !notification.isRead && handleMarkRead(notification.key)}
              className={`w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted/30 ${
                notification.isRead
                  ? "border-border/40 bg-background"
                  : "border-brand/20 bg-brand/5"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    notification.type === "ORDER"
                      ? "bg-brand/10 text-brand"
                      : "bg-warning/10 text-warning"
                  }`}
                >
                  {notification.type === "ORDER" ? (
                    <Package className="h-4 w-4" />
                  ) : (
                    <Wallet className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {notification.title}
                    </p>
                    {!notification.isRead && (
                      <Badge variant="default" className="h-1.5 w-1.5 rounded-full p-0" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {notification.message}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatRelativeTime(notification.createdAt)}
                  </p>
                </div>
                {!notification.isRead && (
                  <div className="hidden shrink-0 sm:block">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkRead(notification.key);
                      }}
                    >
                      <Mail className="h-3 w-3" />
                      Mark read
                    </Button>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
