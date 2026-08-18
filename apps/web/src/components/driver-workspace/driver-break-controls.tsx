'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { describeError } from '@/lib/api/describe-error';
import {
  useStartBreakMutation,
  useEndBreakMutation,
  type DriverWorkspaceProfile,
} from '@/lib/api/driver-workspace';
import { Coffee } from 'lucide-react';

export function DriverBreakControls({ profile }: { profile: DriverWorkspaceProfile }) {
  const startBreak = useStartBreakMutation();
  const endBreak = useEndBreakMutation();
  const pending = startBreak.isPending || endBreak.isPending;

  const handleStart = async () => {
    try {
      await startBreak.mutateAsync();
      toast.success('Break started');
    } catch (err) {
      toast.error(describeError(err, 'Failed to start break'));
    }
  };

  const handleEnd = async () => {
    try {
      await endBreak.mutateAsync();
      toast.success('Break ended');
    } catch (err) {
      toast.error(describeError(err, 'Failed to end break'));
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Coffee className="h-4 w-4 text-muted-foreground" aria-hidden />
            Break
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {profile.onBreak && profile.openBreak
              ? `Started ${new Date(profile.openBreak.startedAt).toLocaleTimeString()}`
              : 'Not on break'}
          </p>
        </div>
        {profile.onBreak ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => void handleEnd()}>
            {pending ? '…' : 'End break'}
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => void handleStart()}>
            {pending ? '…' : 'Start break'}
          </Button>
        )}
      </div>
    </div>
  );
}
