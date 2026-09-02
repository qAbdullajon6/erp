'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { describeError } from '@/lib/api/describe-error';
import { useRejectDispatchMutation } from '@/lib/api/driver-workspace';
import type { DriverRejectReason } from '@/lib/api/my-deliveries';

const REASONS: { value: DriverRejectReason; label: string }[] = [
  { value: 'VEHICLE_ISSUE', label: 'Vehicle issue' },
  { value: 'SICK', label: 'Sick' },
  { value: 'PERSONAL_EMERGENCY', label: 'Personal emergency' },
  { value: 'ALREADY_BUSY', label: 'Already busy' },
  { value: 'OTHER', label: 'Other' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatchId: string;
  onRejected?: () => void;
}

export function DriverRejectSheet({ open, onOpenChange, dispatchId, onRejected }: Props) {
  const reject = useRejectDispatchMutation(dispatchId);
  const [reason, setReason] = useState<DriverRejectReason>('VEHICLE_ISSUE');
  const [note, setNote] = useState('');

  const handleSubmit = async () => {
    if (reason === 'OTHER' && !note.trim()) {
      toast.error('Please add a note for Other');
      return;
    }
    try {
      await reject.mutateAsync({
        reason,
        note: note.trim() || undefined,
      });
      toast.success('Job rejected');
      onOpenChange(false);
      onRejected?.();
    } catch (err) {
      toast.error(describeError(err, 'Failed to reject job'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !reject.isPending && onOpenChange(next)}>
      <SheetContent side="bottom" className="mx-auto max-h-[85dvh] w-full max-w-lg rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Reject job</SheetTitle>
          <SheetDescription>Tell dispatch why you cannot take this assignment.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 pb-6">
          <RadioGroup
            value={reason}
            onValueChange={(v) => setReason(v as DriverRejectReason)}
            className="space-y-2"
          >
            {REASONS.map((r) => (
              <label
                key={r.value}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-3"
              >
                <RadioGroupItem value={r.value} id={`reject-${r.value}`} />
                <span className="text-sm font-medium text-foreground">{r.label}</span>
              </label>
            ))}
          </RadioGroup>
          <div className="space-y-2">
            <Label htmlFor="reject-note">
              Note{reason === 'OTHER' ? ' (required)' : ' (optional)'}
            </Label>
            <Textarea
              id="reject-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Short explanation for dispatch"
            />
          </div>
          <Button
            className="w-full bg-destructive text-destructive-foreground hover:opacity-90"
            disabled={reject.isPending}
            onClick={() => void handleSubmit()}
          >
            {reject.isPending ? 'Rejecting…' : 'Confirm reject'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
