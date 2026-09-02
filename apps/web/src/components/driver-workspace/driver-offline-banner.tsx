'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDriverOfflineSync } from '@/lib/driver/use-driver-offline-sync';

export function DriverOfflineBanner() {
  const { pendingCount, failedCount, totalCount, isFlushing, retryAll } = useDriverOfflineSync();

  if (totalCount === 0) return null;

  const parts: string[] = [];
  if (pendingCount > 0) parts.push(`${pendingCount} pending`);
  if (failedCount > 0) parts.push(`${failedCount} failed`);

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-foreground"
    >
      <div className="flex min-w-0 items-center gap-2">
        <CloudOff className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <p className="min-w-0 truncate">
          Offline queue: {parts.join(', ') || `${totalCount} item${totalCount === 1 ? '' : 's'}`}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 gap-1.5"
        disabled={isFlushing}
        onClick={() => void retryAll()}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isFlushing ? 'animate-spin' : ''}`} aria-hidden />
        {isFlushing ? 'Syncing…' : 'Retry'}
      </Button>
    </div>
  );
}
