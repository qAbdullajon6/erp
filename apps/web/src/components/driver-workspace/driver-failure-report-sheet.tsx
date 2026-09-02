import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X } from 'lucide-react';
import {
  DELIVERY_FAILURE_REASON_LABELS,
  type DeliveryFailureReason,
  useReportDeliveryFailureMutation,
} from '@/lib/api/my-deliveries';
import { describeError } from '@/lib/api/describe-error';

const REASONS = Object.entries(DELIVERY_FAILURE_REASON_LABELS) as [DeliveryFailureReason, string][];

interface DriverFailureReportSheetProps {
  dispatchId: string;
  onClose: () => void;
}

export function DriverFailureReportSheet({ dispatchId, onClose }: DriverFailureReportSheetProps) {
  const [reason, setReason] = useState<DeliveryFailureReason | null>(null);
  const [notes, setNotes] = useState('');
  const { mutateAsync, isPending } = useReportDeliveryFailureMutation(dispatchId);

  const notesRequired = reason === 'OTHER';
  const notesValid = !notesRequired || notes.trim().length > 0;
  const canSubmit = reason !== null && notesValid && !isPending;

  const handleSubmit = async () => {
    if (!reason) return;
    try {
      await mutateAsync({ reason, notes: notes.trim() || undefined });
      toast.success('Delivery failure reported');
      onClose();
    } catch (err) {
      toast.error(describeError(err, 'Failed to report delivery failure'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="text-base font-semibold">Report failed delivery</h2>
        </div>
        <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Select the reason the delivery could not be completed.
        </p>

        <div className="space-y-2">
          {REASONS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setReason(value)}
              className={[
                'w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors',
                reason === value
                  ? 'border-destructive bg-destructive/10 text-destructive'
                  : 'border-border bg-surface text-foreground hover:border-destructive/50',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Notes{notesRequired ? ' (required)' : ' (optional)'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={notesRequired ? 'Describe what happened…' : 'Additional details…'}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive/50"
          />
        </div>
      </div>

      <div className="border-t border-border p-4 space-y-2">
        <Button
          size="lg"
          variant="destructive"
          className="w-full"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
        >
          {isPending ? 'Submitting…' : 'Confirm failed delivery'}
        </Button>
        <Button size="lg" variant="ghost" className="w-full" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
