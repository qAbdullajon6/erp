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
import { useUpdateVehicle, type Vehicle, type VehicleStatus } from '@/lib/api/vehicles';
import { describeError } from '@/lib/api/describe-error';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const OPTIONS: { value: VehicleStatus; hint: string }[] = [
  { value: 'AVAILABLE', hint: 'Ready for new assignments' },
  { value: 'IN_USE', hint: 'Currently on assignment' },
  { value: 'MAINTENANCE', hint: 'Out of service — blocked from dispatch' },
  { value: 'INACTIVE', hint: 'Idle / not in active fleet rotation' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle;
}

export function VehiclesStatusSheet({ open, onOpenChange, vehicle }: Props) {
  const { mutate: update, loading } = useUpdateVehicle(vehicle.id);
  const [status, setStatus] = useState<VehicleStatus>(vehicle.status);

  useEffect(() => {
    if (open) setStatus(vehicle.status);
  }, [open, vehicle.status]);

  const handleSave = async () => {
    if (status === vehicle.status) {
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
            {vehicle.plateNumber} · administrative fleet status
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5 scrollbar-thin">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Current</span>
            <StatusBadge status={vehicle.status} />
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

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
          <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-gradient-brand text-brand-foreground hover:opacity-90"
            disabled={loading}
            onClick={() => void handleSave()}
          >
            {loading ? 'Saving…' : 'Update status'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
