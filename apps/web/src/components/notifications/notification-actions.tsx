'use client';

import { Archive, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { describeError } from '@/lib/api/describe-error';
import { useBulkMarkAsRead, useBulkArchive } from '@/lib/api/notification-center';

interface NotificationActionsProps {
  selectedCount: number;
  selectedIds: string[];
  onClearSelection: () => void;
}

export function NotificationActions({
  selectedCount,
  selectedIds,
  onClearSelection,
}: NotificationActionsProps) {
  const bulkMarkAsRead = useBulkMarkAsRead();
  const bulkArchive = useBulkArchive();

  const handleBulkMarkAsRead = async () => {
    try {
      await bulkMarkAsRead.mutateAsync(selectedIds);
      onClearSelection();
    } catch (err) {
      toast.error(describeError(err, 'Failed to mark selected as read'));
    }
  };

  const handleBulkArchive = async () => {
    try {
      await bulkArchive.mutateAsync(selectedIds);
      onClearSelection();
    } catch (err) {
      toast.error(describeError(err, 'Failed to archive selected'));
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-surface-elevated px-4 py-3">
      <span className="text-sm font-medium">{selectedCount} selected</span>
      <div className="flex flex-1 items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleBulkMarkAsRead}>
          <Check className="mr-2 h-4 w-4" />
          Mark as Read
        </Button>
        <Button variant="outline" size="sm" onClick={handleBulkArchive}>
          <Archive className="mr-2 h-4 w-4" />
          Archive
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={onClearSelection} aria-label="Clear selection">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
