'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ApiDispatch } from '@/lib/api/dispatches';
import { describeError } from '@/lib/api/describe-error';
import { useUpdateDispatch } from '@/lib/hooks/use-dispatches';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { StickyNote } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatch: ApiDispatch;
}

/// Dispatcher notes via Sheet — same chrome as Orders edit.
export function DispatchNotesSheet({ open, onOpenChange, dispatch }: Props) {
  const { update, loading } = useUpdateDispatch(dispatch.id);
  const [notes, setNotes] = useState(dispatch.notes ?? '');

  useEffect(() => {
    if (open) setNotes(dispatch.notes ?? '');
  }, [open, dispatch.id, dispatch.notes]);

  const dirty = notes !== (dispatch.notes ?? '');

  const handleSave = async () => {
    try {
      await update({ notes: notes.trim() || undefined });
      toast.success('Notes saved');
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to save notes'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">Edit notes</SheetTitle>
          <SheetDescription className="text-xs">
            Internal dispatcher notes for {dispatch.dispatchNumber}.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                <StickyNote className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-sm font-semibold">Dispatcher notes</h3>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dispatch-notes" className="text-xs font-medium text-muted-foreground">
                Notes
              </Label>
              <Textarea
                id="dispatch-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={8}
                maxLength={2000}
                placeholder="Handoff details, customer preferences, exceptions…"
              />
              <p className="text-[11px] text-muted-foreground">{notes.length}/2000</p>
            </div>
            {dispatch.deliveryNotes ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Delivery notes (read-only)
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">
                  {dispatch.deliveryNotes}
                </p>
              </div>
            ) : null}
          </section>
        </div>

        <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={loading || !dirty}>
              {loading ? 'Saving…' : 'Save notes'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
