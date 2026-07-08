"use client";

import React, { useEffect, useState } from "react";
import { useApiSession } from "@/lib/api-session";
import { apiClient, type ApiNotification, type NotificationSettings, type NotificationCategory, type NotificationSeverity } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle, Archive, Settings, Loader2, ShieldAlert } from "lucide-react";

type SectionState = "loading" | "loaded" | "error" | "session-expired" | "forbidden";

function SectionMessage({ state, message, onRetry }: { state: SectionState; message: string; onRetry: () => void }) {
  if (state === "loading") {
    return (
      <p className="flex items-center gap-1.5 py-8 text-center text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </p>
    );
  }
  if (state === "forbidden") {
    return (
      <p className="flex items-center gap-1.5 py-8 text-center text-sm text-destructive">
        <ShieldAlert className="size-4" />
        You don&apos;t have access to notifications.
      </p>
    );
  }
  if (state === "session-expired") {
    return (
      <p className="flex items-center gap-1.5 py-8 text-center text-sm text-destructive">
        <AlertCircle className="size-4" />
        {message}
      </p>
    );
  }
  if (state === "error") {
    return (
      <div className="space-y-2 py-8">
        <p className="flex items-center gap-1.5 text-center text-sm text-destructive">
          <AlertCircle className="size-4" />
          {message}
        </p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  return null;
}

function classifyError(error: unknown): { state: SectionState; message: string } {
  const message = error instanceof Error ? error.message : "Something went wrong";
  if (message.includes("403")) return { state: "forbidden", message: "You don&apos;t have access to notifications" };
  if (/invalid|expired|unauthorized|not signed in/i.test(message)) return { state: "session-expired", message };
  return { state: "error", message };
}

function getSeverityColor(severity: NotificationSeverity): string {
  switch (severity) {
    case "CRITICAL": return "bg-red-100 text-red-900";
    case "HIGH": return "bg-orange-100 text-orange-900";
    case "MEDIUM": return "bg-yellow-100 text-yellow-900";
    case "LOW": return "bg-blue-100 text-blue-900";
    default: return "bg-gray-100 text-gray-900";
  }
}

interface FilterState {
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  isRead?: boolean;
  isArchived: boolean;
}

export function NotificationsConnectedView() {
  const { session, callApi } = useApiSession();
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [state, setState] = useState<SectionState>("loading");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<FilterState>({ isArchived: false });
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const fetchNotifications = async () => {
      setState("loading");
      setError("");
      try {
        const [list, count] = await Promise.all([
          callApi((token) =>
            apiClient.listNotifications(token, {
              page,
              limit,
              category: filters.category,
              severity: filters.severity,
              isRead: filters.isRead,
              isArchived: filters.isArchived,
              sortBy: "createdAt",
              sortOrder: "desc",
            })
          ),
          callApi((token) => apiClient.getUnreadNotificationCount(token)),
        ]);
        if (!cancelled) {
          setNotifications(list.items);
          setTotal(list.meta.total);
          setUnreadCount(count.unreadCount);
          setState("loaded");
        }
      } catch (e) {
        if (!cancelled) {
          const { state: s, message } = classifyError(e);
          setState(s);
          setError(message);
        }
      }
    };

    Promise.resolve().then(() => { if (!cancelled) fetchNotifications(); });
    return () => { cancelled = true; };
  }, [session, filters, page, limit, reloadToken, callApi]);

  useEffect(() => {
    if (!session || !showSettings) return;
    let cancelled = false;

    callApi((token) => apiClient.getNotificationSettings(token)).then(
      (s) => { if (!cancelled) setSettings(s); },
      () => { if (!cancelled) setSettings(null); },
    );

    return () => { cancelled = true; };
  }, [session, showSettings, callApi]);

  const reload = () => setReloadToken((n) => n + 1);

  const handleMarkRead = async (id: string) => {
    if (!session) return;
    setActingOnId(id);
    try {
      await callApi((token) => apiClient.markNotificationRead(token, id));
      reload();
    } catch (e) {
      console.error("Failed to mark as read:", e);
    } finally {
      setActingOnId(null);
    }
  };

  const handleMarkUnread = async (id: string) => {
    if (!session) return;
    setActingOnId(id);
    try {
      await callApi((token) => apiClient.markNotificationUnread(token, id));
      reload();
    } catch (e) {
      console.error("Failed to mark as unread:", e);
    } finally {
      setActingOnId(null);
    }
  };

  const handleArchive = async (id: string) => {
    if (!session) return;
    setActingOnId(id);
    try {
      await callApi((token) => apiClient.archiveNotification(token, id));
      reload();
    } catch (e) {
      console.error("Failed to archive:", e);
    } finally {
      setActingOnId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (!session) return;
    try {
      await callApi((token) => apiClient.markAllNotificationsRead(token));
      reload();
    } catch (e) {
      console.error("Failed to mark all as read:", e);
    }
  };

  const handleArchiveAll = async () => {
    if (!session) return;
    try {
      await callApi((token) => apiClient.archiveAllNotifications(token));
      reload();
    } catch (e) {
      console.error("Failed to archive all:", e);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-2">Unread: {unreadCount}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSettings(!showSettings)}
          className="gap-2"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Button>
      </div>

      {/* Filters */}
      <div className="grid gap-4 md:grid-cols-4">
        <Select value={filters.category || ""} onValueChange={(v) => { setFilters({ ...filters, category: v as NotificationCategory | undefined }); setPage(1); }}>
          <SelectTrigger>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Categories</SelectItem>
            <SelectItem value="OPERATIONS">Operations</SelectItem>
            <SelectItem value="FINANCE">Finance</SelectItem>
            <SelectItem value="CUSTOMERS">Customers</SelectItem>
            <SelectItem value="FLEET">Fleet</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.severity || ""} onValueChange={(v) => { setFilters({ ...filters, severity: v as NotificationSeverity | undefined }); setPage(1); }}>
          <SelectTrigger>
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Severities</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.isRead === undefined ? "" : filters.isRead ? "read" : "unread"} onValueChange={(v) => { setFilters({ ...filters, isRead: v === "" ? undefined : v === "read" }); setPage(1); }}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!filters.isArchived}
            onChange={({ target }) => setFilters({ ...filters, isArchived: !target.checked })}
            id="hide-archived"
          />
          <label htmlFor="hide-archived" className="text-sm">Hide Archived</label>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleMarkAllRead} disabled={unreadCount === 0}>Mark All Read</Button>
        <Button size="sm" variant="outline" onClick={handleArchiveAll}>Archive All</Button>
      </div>

      {/* Notifications List or Loading State */}
      {state === "loading" && <SectionMessage state="loading" message="" onRetry={reload} />}
      {state === "error" && <SectionMessage state="error" message={error} onRetry={reload} />}
      {state === "session-expired" && <SectionMessage state="session-expired" message={error} onRetry={reload} />}
      {state === "forbidden" && <SectionMessage state="forbidden" message="" onRetry={reload} />}

      {state === "loaded" && (
        <>
          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="text-muted-foreground">No notifications matching your filters</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notif) => (
                <div key={notif.id} className={`border rounded-lg p-4 ${notif.isRead ? "bg-muted/30" : "bg-white"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm">{notif.title}</h3>
                        <Badge variant="outline" className={getSeverityColor(notif.severity)}>
                          {notif.severity}
                        </Badge>
                        {!notif.isRead && <Badge className="bg-blue-500">Unread</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{notif.message}</p>
                      <p className="text-xs text-muted-foreground mt-2">{new Date(notif.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-1">
                      {!notif.isRead ? (
                        <Button size="sm" variant="ghost" onClick={() => handleMarkRead(notif.id)} disabled={actingOnId === notif.id}>
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => handleMarkUnread(notif.id)} disabled={actingOnId === notif.id}>
                          <AlertCircle className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleArchive(notif.id)} disabled={actingOnId === notif.id}>
                        <Archive className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 per page</SelectItem>
                  <SelectItem value="20">20 per page</SelectItem>
                  <SelectItem value="50">50 per page</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
                  Previous
                </Button>
                <span className="text-sm flex items-center">
                  Page {page} of {totalPages}
                </span>
                <Button size="sm" variant="outline" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Settings Modal (simplified inline) */}
      {showSettings && settings && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <h3 className="font-semibold">Notification Settings</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.lowSeverityEnabled}
                onChange={(e) => setSettings({ ...settings, lowSeverityEnabled: e.target.checked })}
              />
              <span className="text-sm">Enable low-severity notifications</span>
            </label>
            <div>
              <label className="text-sm">Invoice due soon threshold (days)</label>
              <Input
                type="number"
                min="1"
                max="90"
                value={settings.invoiceDueSoonDays}
                onChange={(e) => setSettings({ ...settings, invoiceDueSoonDays: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-sm">Credit limit warning percentage</label>
              <Input
                type="number"
                min="1"
                max="100"
                value={settings.creditLimitWarningPercent}
                onChange={(e) => setSettings({ ...settings, creditLimitWarningPercent: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-sm">Expiry warning days (driver license, vehicle insurance/inspection)</label>
              <Input
                type="number"
                min="1"
                max="365"
                value={settings.expiryWarningDays}
                onChange={(e) => setSettings({ ...settings, expiryWarningDays: Number(e.target.value) })}
              />
            </div>
          </div>
          <Button onClick={() => setShowSettings(false)}>Close</Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Notifications are generated in real-time from your organization&apos;s data. AI Assistant and some features are still in development.
      </p>
    </div>
  );
}
