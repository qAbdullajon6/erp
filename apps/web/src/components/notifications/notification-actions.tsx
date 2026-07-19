'use client';

import { Archive, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    await bulkMarkAsRead.mutateAsync(selectedIds);
    onClearSelection();
  };

  const handleBulkArchive = async () => {
    await bulkArchive.mutateAsync(selectedIds);
    onClearSelection();
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
      <Button variant="ghost" size="sm" onClick={onClearSelection}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
