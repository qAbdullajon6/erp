'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import { describeError } from '@/lib/api/describe-error';
import { useUpdateDispatchStatus } from '@/lib/hooks/use-dispatches';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

const NEXT_ACTION_LABEL: Partial<Record<DispatchStatus, string>> = {
  EN_ROUTE_TO_PICKUP: 'Head to pickup',
  AT_PICKUP: 'Arrived at pickup',
  IN_TRANSIT: 'Mark picked up',
  DELIVERED: 'Mark delivered',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatch: ApiDispatch;
  /** Prefill when opened from a specific next-action CTA. */
  initialStatus?: DispatchStatus | null;
}

/// Status transitions via Sheet — same chrome as Orders edit (~780px, sticky footer).
export function DispatchStatusSheet({
  open,
  onOpenChange,
  dispatch,
  initialStatus = null,
}: Props) {
  const { updateStatus, loading } = useUpdateDispatchStatus(dispatch.id);
  const options = dispatch.allowedTransitions.filter((s) => s !== 'CANCELLED') as DispatchStatus[];
  const [status, setStatus] = useState<DispatchStatus | ''>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    const opts = dispatch.allowedTransitions.filter((s) => s !== 'CANCELLED') as DispatchStatus[];
    const preferred =
      initialStatus && opts.includes(initialStatus) ? initialStatus : opts[0] ?? '';
    setStatus(preferred);
    setNote('');
  }, [open, dispatch.id, dispatch.allowedTransitions, initialStatus]);

  const handleSave = async () => {
    if (!status) return;
    try {
      await updateStatus({ status, note: note.trim() || undefined });
      toast.success(`${dispatch.dispatchNumber} → ${statusLabel(status)}`);
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
            {dispatch.dispatchNumber} · only transitions the API allows are listed.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={dispatch.status} />
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Select next step</span>
          </div>

          {options.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              No further status changes are available for this dispatch.
            </p>
          ) : (
            <div className="space-y-2">
              {options.map((s) => {
                const selected = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setStatus(s)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors',
                      selected
                        ? 'border-brand bg-brand/5 ring-1 ring-brand/30'
                        : 'border-border/70 hover:border-border hover:bg-muted/30',
                    )}
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {NEXT_ACTION_LABEL[s] ?? statusLabel(s)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{statusLabel(s)}</p>
                    </div>
                    {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-6 space-y-1.5">
            <Label htmlFor="dispatch-status-note" className="text-xs font-medium text-muted-foreground">
              Note <span className="font-normal">(optional)</span>
            </Label>
            <Textarea
              id="dispatch-status-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Why this change, or what the driver reported…"
              disabled={options.length === 0}
            />
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={loading || !status}>
              {loading ? 'Updating…' : 'Update status'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
