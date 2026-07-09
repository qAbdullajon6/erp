import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useNotificationSettingsQuery,
  useUpdateNotificationSettingsMutation,
  type NotificationCategory,
} from '@/lib/api/notifications';

const CATEGORY_OPTIONS: { value: NotificationCategory; label: string; hint: string }[] = [
  { value: 'OPERATIONS', label: 'Operations', hint: 'Delayed & unassigned orders' },
  { value: 'FINANCE', label: 'Finance', hint: 'Overdue & upcoming invoices, negative-profit orders' },
  { value: 'CUSTOMERS', label: 'Customers', hint: 'Credit limit warnings, at-risk customers' },
  { value: 'FLEET', label: 'Fleet', hint: 'Vehicle insurance/inspection, driver license expiry' },
];

export function NotificationPreferences() {
  const { data: settings, isLoading, isError, error, refetch } = useNotificationSettingsQuery();
  const { mutateAsync, isPending } = useUpdateNotificationSettingsMutation();

  const [enabledCategories, setEnabledCategories] = useState<NotificationCategory[]>([]);
  const [invoiceDueSoonDays, setInvoiceDueSoonDays] = useState(3);
  const [creditLimitWarningPercent, setCreditLimitWarningPercent] = useState(80);
  const [expiryWarningDays, setExpiryWarningDays] = useState(30);
  const [lowSeverityEnabled, setLowSeverityEnabled] = useState(true);

  useEffect(() => {
    if (settings) {
      setEnabledCategories(settings.enabledCategories);
      setInvoiceDueSoonDays(settings.invoiceDueSoonDays);
      setCreditLimitWarningPercent(settings.creditLimitWarningPercent);
      setExpiryWarningDays(settings.expiryWarningDays);
      setLowSeverityEnabled(settings.lowSeverityEnabled);
    }
  }, [settings]);

  const toggleCategory = (category: NotificationCategory) => {
    setEnabledCategories((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]));
  };

  const handleSave = async () => {
    try {
      await mutateAsync({
        enabledCategories,
        invoiceDueSoonDays,
        creditLimitWarningPercent,
        expiryWarningDays,
        lowSeverityEnabled,
      });
      toast.success('Notification preferences saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save preferences');
    }
  };

  if (isLoading) {
    return <Skeleton className="h-96 rounded-lg" />;
  }

  if (isError || !settings) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load preferences'}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-brand/10 bg-surface p-6">
        <h2 className="font-semibold text-foreground">Enabled Categories</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A disabled category is never generated at all, regardless of what any individual role could otherwise see.
        </p>
        <div className="mt-4 space-y-3">
          {CATEGORY_OPTIONS.map((cat) => (
            <label key={cat.value} className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={enabledCategories.includes(cat.value)}
                onChange={() => toggleCategory(cat.value)}
                className="mt-1 h-4 w-4 rounded border-input"
              />
              <div>
                <p className="text-sm font-medium text-foreground">{cat.label}</p>
                <p className="text-xs text-muted-foreground">{cat.hint}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-brand/10 bg-surface p-6">
        <h2 className="font-semibold text-foreground">Thresholds</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-foreground">Invoice due-soon window (days)</label>
            <Input
              type="number"
              min={1}
              max={90}
              value={invoiceDueSoonDays}
              onChange={(e) => setInvoiceDueSoonDays(parseInt(e.target.value, 10) || 1)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Credit limit warning (%)</label>
            <Input
              type="number"
              min={1}
              max={100}
              value={creditLimitWarningPercent}
              onChange={(e) => setCreditLimitWarningPercent(parseInt(e.target.value, 10) || 1)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Expiry warning window (days)</label>
            <Input
              type="number"
              min={1}
              max={365}
              value={expiryWarningDays}
              onChange={(e) => setExpiryWarningDays(parseInt(e.target.value, 10) || 1)}
              className="mt-1"
            />
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={lowSeverityEnabled}
            onChange={(e) => setLowSeverityEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <span className="text-sm font-medium text-foreground">Show low-severity notifications</span>
        </label>
      </div>

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? 'Saving...' : 'Save Preferences'}
      </Button>
    </div>
  );
}
