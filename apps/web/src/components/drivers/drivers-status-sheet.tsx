'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useUpdateDriver, type Driver, type DriverStatus } from '@/lib/api/drivers';
import { describeError } from '@/lib/api/describe-error';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const OPTIONS: { value: DriverStatus; hint: string }[] = [
  { value: 'ACTIVE', hint: 'Can take new assignments' },
  { value: 'INACTIVE', hint: 'Blocked from new assignments' },
  { value: 'ON_LEAVE', hint: 'Temporarily unavailable' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: Driver;
}

export function DriversStatusSheet({ open, onOpenChange, driver }: Props) {
  const { mutate: update, loading } = useUpdateDriver(driver.id);
  const [status, setStatus] = useState<DriverStatus>(driver.status);

  useEffect(() => {
    if (open) setStatus(driver.status);
  }, [open, driver.status]);

  const handleSave = async () => {
    if (status === driver.status) {
      onOpenChange(false);
      return;
    }
    try {
      await update({ status });
      toast.success(`Status → ${statusLabel(status)}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to update status'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">Update status</SheetTitle>
          <SheetDescription className="text-xs">
            {driver.firstName} {driver.lastName} · administrative employment status
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5 scrollbar-thin">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Current</span>
            <StatusBadge status={driver.status} />
          </div>
          {OPTIONS.map((opt) => {
            const selected = status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors',
                  selected
                    ? 'border-brand bg-brand/5 ring-1 ring-brand/30'
                    : 'border-border/70 hover:bg-muted/30',
                )}
              >
                <div>
                  <p className="text-sm font-semibold">{statusLabel(opt.value)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{opt.hint}</p>
                </div>
                {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" />}
              </button>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={loading}>
              {loading ? 'Updating…' : 'Update status'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
