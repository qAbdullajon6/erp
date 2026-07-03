"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { notificationCategoryMeta, notificationCategoryOrder } from "@/lib/status-meta";
import { useNotificationSettings } from "@/lib/notification-settings";
import type { NotificationThresholds } from "@/lib/notification-settings";

const thresholdFields: { key: keyof NotificationThresholds; label: string; suffix: string }[] = [
  { key: "deliveryDueSoonHours", label: "Delivery due soon", suffix: "hours" },
  { key: "unassignedOrderHours", label: "Unassigned order alert", suffix: "hours" },
  { key: "invoiceDueSoonDays", label: "Invoice due soon", suffix: "days" },
  { key: "deliveredWithoutInvoiceDays", label: "Delivered without invoice", suffix: "days" },
  { key: "maintenanceDueSoonDays", label: "Maintenance due soon", suffix: "days" },
  { key: "documentExpiryDueSoonDays", label: "Document expiry due soon", suffix: "days" },
  { key: "creditLimitWarningPercent", label: "Credit limit warning", suffix: "%" },
];

export function NotificationSettingsSheet({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const { settings, setCategoryEnabled, setThreshold, resetToDefaults } = useNotificationSettings();

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Notification Settings</SheetTitle>
          <SheetDescription>
            Choose which categories generate alerts and tune the thresholds.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Categories</p>
            <div className="space-y-2">
              {notificationCategoryOrder.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center justify-between rounded-lg border border-border p-2.5 text-sm"
                >
                  {notificationCategoryMeta[cat].label}
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={settings.categories[cat]}
                    onChange={(e) => setCategoryEnabled(cat, e.target.checked)}
                  />
                </label>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Thresholds</p>
            <div className="space-y-3">
              {thresholdFields.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-3">
                  <Label htmlFor={f.key} className="text-sm">
                    {f.label}
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id={f.key}
                      type="number"
                      min="0"
                      className="w-20"
                      value={settings.thresholds[f.key]}
                      onChange={(e) => setThreshold(f.key, Number(e.target.value) || 0)}
                    />
                    <span className="text-xs text-muted-foreground">{f.suffix}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={resetToDefaults}>
            Reset to Defaults
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
