'use client';

import { AlertTriangle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmationBannerProps {
  action: string;
  details: Record<string, unknown>;
  onConfirm: () => void;
  onDeny: () => void;
}

export function ConfirmationBanner({ action, details, onConfirm, onDeny }: ConfirmationBannerProps) {
  return (
    <div className="mx-4 my-2 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/20 text-warning">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Confirmation required</p>
          <p className="mt-1 text-sm text-muted-foreground">{action}</p>
          {Object.keys(details).length > 0 && (
            <div className="mt-2 rounded-md bg-muted/50 p-2">
              <pre className="text-xs text-muted-foreground">
                {JSON.stringify(details, null, 2)}
              </pre>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={onConfirm} className="gap-1">
              <Check className="h-3.5 w-3.5" />
              Continue
            </Button>
            <Button size="sm" variant="outline" onClick={onDeny} className="gap-1">
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
