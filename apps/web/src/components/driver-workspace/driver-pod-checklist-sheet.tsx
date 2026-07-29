'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { describeError } from '@/lib/api/describe-error';
import {
  useDriverProofsQuery,
  useUploadDriverPhotoMutation,
  useUploadDriverSignatureMutation,
  useUpdatePodMetaMutation,
  type PodChecklistConfig,
} from '@/lib/api/driver-workspace';
import { isOfflineQueuedResult } from '@/lib/driver/offline-queue';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatchId: string;
  checklist: PodChecklistConfig;
}

export function DriverPodChecklistSheet({ open, onOpenChange, dispatchId, checklist }: Props) {
  const proofs = useDriverProofsQuery(dispatchId, open);
  const uploadPhoto = useUploadDriverPhotoMutation(dispatchId);
  const uploadSig = useUploadDriverSignatureMutation(dispatchId);
  const updateMeta = useUpdatePodMetaMutation(dispatchId);

  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [odometerKm, setOdometerKm] = useState('');

  const pending = uploadPhoto.isPending || uploadSig.isPending || updateMeta.isPending;

  const handlePhoto = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      let queued = false;
      for (const file of Array.from(files)) {
        const result = await uploadPhoto.mutateAsync(file);
        if (isOfflineQueuedResult(result)) queued = true;
      }
      if (!queued) toast.success('Photo uploaded');
    } catch (err) {
      toast.error(describeError(err, 'Failed to upload photo'));
    }
  };

  const handleSignature = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const result = await uploadSig.mutateAsync(file);
      if (!isOfflineQueuedResult(result)) toast.success('Signature uploaded');
    } catch (err) {
      toast.error(describeError(err, 'Failed to upload signature'));
    }
  };

  const handleSaveMeta = async () => {
    try {
      const result = await updateMeta.mutateAsync({
        receiverName: receiverName.trim() || undefined,
        receiverPhone: receiverPhone.trim() || undefined,
        notes: notes.trim() || undefined,
        odometerKm: odometerKm ? Number(odometerKm) : undefined,
      });
      if (!isOfflineQueuedResult(result)) toast.success('POD details saved');
    } catch (err) {
      toast.error(describeError(err, 'Failed to save POD details'));
    }
  };

  const items = proofs.data?.items ?? [];
  const photoCount = items.filter((p) => p.type === 'PHOTO' && p.fileSize > 0).length;
  const sigCount = items.filter((p) => p.type === 'SIGNATURE').length;

  return (
    <Sheet open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Proof of delivery</SheetTitle>
          <SheetDescription>Complete the checklist before marking delivered.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 pb-8">
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Required:{' '}
            {[
              checklist.requirePhotos && 'photos',
              checklist.requireSignature && 'signature',
              checklist.requireReceiverName && 'receiver name',
              checklist.requireReceiverPhone && 'receiver phone',
              checklist.requireNotes && 'notes',
            ]
              .filter(Boolean)
              .join(', ') || 'none'}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pod-photos">
              Photos {checklist.requirePhotos ? '*' : ''} ({photoCount})
            </Label>
            <Input
              id="pod-photos"
              type="file"
              accept="image/*"
              multiple
              disabled={pending}
              onChange={(e) => void handlePhoto(e.target.files)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pod-sig">
              Signature {checklist.requireSignature ? '*' : ''} ({sigCount})
            </Label>
            <Input
              id="pod-sig"
              type="file"
              accept="image/*"
              disabled={pending}
              onChange={(e) => void handleSignature(e.target.files)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pod-name">Receiver name {checklist.requireReceiverName ? '*' : ''}</Label>
            <Input
              id="pod-name"
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pod-phone">Receiver phone {checklist.requireReceiverPhone ? '*' : ''}</Label>
            <Input
              id="pod-phone"
              value={receiverPhone}
              onChange={(e) => setReceiverPhone(e.target.value)}
              maxLength={40}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pod-notes">Notes {checklist.requireNotes ? '*' : ''}</Label>
            <Textarea
              id="pod-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pod-odo">Odometer (km)</Label>
            <Input
              id="pod-odo"
              type="number"
              min={0}
              step={0.1}
              value={odometerKm}
              onChange={(e) => setOdometerKm(e.target.value)}
            />
          </div>

          <Button className="w-full" disabled={pending} onClick={() => void handleSaveMeta()}>
            {pending ? 'Saving…' : 'Save POD details'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
