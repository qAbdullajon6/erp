'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { describeError } from '@/lib/api/describe-error';
import { useAcceptDispatchMutation } from '@/lib/api/driver-workspace';
import type { MyDelivery } from '@/lib/api/my-deliveries';
import { DriverRejectSheet } from './driver-reject-sheet';
import { Check, X } from 'lucide-react';

interface Props {
  delivery: MyDelivery;
  onAccepted?: () => void;
  onRejected?: () => void;
}

export function DriverAcceptRejectActions({ delivery, onAccepted, onRejected }: Props) {
  const accept = useAcceptDispatchMutation(delivery.id);
  const [rejectOpen, setRejectOpen] = useState(false);

  if ((delivery.driverAcceptanceStatus ?? 'PENDING') !== 'PENDING' || delivery.status !== 'ASSIGNED') {
    return null;
  }

  const handleAccept = async () => {
    try {
      await accept.mutateAsync();
      toast.success('Job accepted');
      onAccepted?.();
    } catch (err) {
      toast.error(describeError(err, 'Failed to accept job'));
    }
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">New assignment</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Accept to unlock trip actions, or reject with a reason.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            className="gap-1.5 bg-gradient-brand text-brand-foreground hover:opacity-90"
            disabled={accept.isPending}
            onClick={() => void handleAccept()}
          >
            <Check className="h-4 w-4" />
            {accept.isPending ? 'Accepting…' : 'Accept'}
          </Button>
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={accept.isPending}
            onClick={() => setRejectOpen(true)}
          >
            <X className="h-4 w-4" />
            Reject
          </Button>
        </div>
      </div>
      <DriverRejectSheet
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        dispatchId={delivery.id}
        onRejected={onRejected}
      />
    </>
  );
}
