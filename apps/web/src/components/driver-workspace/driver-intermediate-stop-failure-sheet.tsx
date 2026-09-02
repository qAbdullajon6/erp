'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AlertCircle, X } from 'lucide-react';
import {
  DELIVERY_FAILURE_REASON_LABELS,
  type DeliveryFailureReason,
  useReportIntermediateStopFailureMutation,
} from '@/lib/api/my-deliveries';
import { describeError } from '@/lib/api/describe-error';

const REASONS = Object.entries(DELIVERY_FAILURE_REASON_LABELS) as [DeliveryFailureReason, string][];

interface Props {
  dispatchId: string;
  stopId: string;
  stopIndex: number;
  onClose: () => void;
}

export function DriverIntermediateStopFailureSheet({ dispatchId, stopId, stopIndex, onClose }: Props) {
  const [reason, setReason] = useState<DeliveryFailureReason | null>(null);
  const [notes, setNotes] = useState('');
  const { mutateAsync, isPending } = useReportIntermediateStopFailureMutation(dispatchId, stopId);

  const notesRequired = reason === 'OTHER';
  const notesValid = !notesRequired || notes.trim().length > 0;
  const canSubmit = reason !== null && notesValid && !isPending;

  const handleSubmit = async () => {
    if (!reason) return;
    try {
      await mutateAsync({ reason, notes: notes.trim() || undefined });
      toast.success('Stop skipped — continuing to next destination');
      onClose();
    } catch (err) {
      const description = describeError(err, 'Failed to report stop failure');
      if (description.includes('409') || description.toLowerCase().includes('concurrent')) {
        toast.error('Stop was already updated — refreshing');
      } else {
        toast.error(description);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={`Report failure for stop ${stopIndex}`}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-base font-semibold">Can&apos;t complete stop {stopIndex}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          aria-label="Cancel"
          className="rounded-full p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Select the reason this stop could not be completed. Delivery will continue to the next destination.
        </p>

        <div className="space-y-2" role="radiogroup" aria-label="Failure reason">
          {REASONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={reason === value}
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
          <label htmlFor="stop-failure-notes" className="block text-sm font-medium text-foreground mb-1">
            Notes{notesRequired ? ' (required)' : ' (optional)'}
          </label>
          <textarea
            id="stop-failure-notes"
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
          type="button"
          size="lg"
          variant="destructive"
          className="w-full"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          aria-disabled={!canSubmit}
        >
          {isPending ? 'Submitting…' : 'Confirm stop failure'}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          className="w-full"
          onClick={onClose}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
