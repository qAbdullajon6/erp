'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Check, Copy } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  ingestSecret: string | null;
  secretPrefix?: string | null;
}

export function DeviceSecretDialog({
  open,
  onOpenChange,
  title,
  description,
  ingestSecret,
  secretPrefix,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!ingestSecret) return;
    try {
      await navigator.clipboard.writeText(ingestSecret);
      setCopied(true);
      toast.success('Secret copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy secret');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {ingestSecret ? (
          <div className="space-y-3">
            {secretPrefix ? (
              <p className="text-xs text-muted-foreground">
                Prefix <span className="font-mono text-foreground">{secretPrefix}</span>
              </p>
            ) : null}
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <code className="break-all font-mono text-xs text-foreground">{ingestSecret}</code>
            </div>
            <Button type="button" className="w-full" onClick={() => void handleCopy()}>
              {copied ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy secret
                </>
              )}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
