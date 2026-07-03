"use client";

import * as React from "react";
import { Search, Settings, CheckCheck, Archive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { resolveDateRange, isWithinRange, type DateRangeOption } from "@/lib/date-range";
import { getReferenceNow } from "@/lib/mock-data";
import { getNotifications, type NotificationCategory } from "@/lib/notifications";
import { useNotificationSettings } from "@/lib/notification-settings";
import { useNotificationState } from "@/lib/notification-state";
import { useAppData } from "@/lib/store";
import { DateRangeFilter, type CustomRange } from "@/components/finance/date-range-filter";
import { NotificationRow } from "@/components/notifications/notification-row";
import { NotificationSettingsSheet } from "@/components/notifications/notification-settings-sheet";
import { notificationCategoryMeta, notificationCategoryOrder } from "@/lib/status-meta";

type TabValue = "all" | "unread" | NotificationCategory;

function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function NotificationCenterView() {
  const { orders, drivers, vehicles, invoices, customers, expenses } = useAppData();
  const { settings } = useNotificationSettings();
  const { isRead, isArchived, markRead, markAllRead, archive, archiveAllRead } =
    useNotificationState();

  const now = getReferenceNow();
  const [tab, setTab] = React.useState<TabValue>("all");
  const [search, setSearch] = React.useState("");
  const [dateOption, setDateOption] = React.useState<DateRangeOption>("this_month");
  const [custom, setCustom] = React.useState<CustomRange>(() => ({
    start: toDateInput(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
    end: toDateInput(now),
  }));
  const [showSettings, setShowSettings] = React.useState(false);

  const bounds = resolveDateRange(dateOption, now, custom);

  const all = getNotifications(
    { orders, drivers, vehicles, invoices, customers, expenses },
    settings.thresholds,
  ).filter((n) => settings.categories[n.category]);

  const visible = all
    .filter((n) => !isArchived(n.id))
    .filter((n) => isWithinRange(n.at, bounds))
    .filter((n) => {
      if (tab === "all") return true;
      if (tab === "unread") return !isRead(n.id);
      return n.category === tab;
    })
    .filter((n) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.description.toLowerCase().includes(q);
    });

  const unreadCount = all.filter((n) => !isArchived(n.id) && !isRead(n.id)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search notifications..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <DateRangeFilter
          option={dateOption}
          onOptionChange={setDateOption}
          custom={custom}
          onCustomChange={setCustom}
        />

        <div className="flex gap-2 sm:ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => markAllRead(visible.map((n) => n.id))}
          >
            <CheckCheck className="size-3.5" />
            Mark all read
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => archiveAllRead(all.map((n) => n.id))}
          >
            <Archive className="size-3.5" />
            Archive read
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowSettings(true)}>
            <Settings className="size-3.5" />
            Settings
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}</TabsTrigger>
          {notificationCategoryOrder.map((cat) => (
            <TabsTrigger key={cat} value={cat}>
              {notificationCategoryMeta[cat].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="space-y-2">
          {visible.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing here — you&apos;re all caught up.
            </p>
          )}
          {visible.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              read={isRead(n.id)}
              onMarkRead={() => markRead(n.id)}
              onArchive={() => archive(n.id)}
            />
          ))}
        </CardContent>
      </Card>

      {showSettings && <NotificationSettingsSheet onOpenChange={setShowSettings} />}
    </div>
  );
}
