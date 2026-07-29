'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { describeError } from '@/lib/api/describe-error';
import {
  useCreateInspectionMutation,
  useUploadInspectionPhotoMutation,
} from '@/lib/api/driver-workspace';
import { isOfflineQueuedResult } from '@/lib/driver/offline-queue';

const CHECKS = [
  { key: 'tyres', label: 'Tyres' },
  { key: 'lights', label: 'Lights' },
  { key: 'brakes', label: 'Brakes' },
  { key: 'oil', label: 'Oil' },
  { key: 'coolant', label: 'Coolant' },
  { key: 'documents', label: 'Documents' },
] as const;

type CheckKey = (typeof CHECKS)[number]['key'];

const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_PHOTO_BYTES = 8_000_000;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  dispatchId?: string;
}

export function DriverInspectionSheet({ open, onOpenChange, vehicleId, dispatchId }: Props) {
  const create = useCreateInspectionMutation();
  const uploadPhoto = useUploadInspectionPhotoMutation();
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>({
    tyres: true,
    lights: true,
    brakes: true,
    oil: true,
    coolant: true,
    documents: true,
  });
  const [notes, setNotes] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const onAddPhotos = (list: FileList | null) => {
    if (!list?.length) return;
    const next: File[] = [...photos];
    for (const file of Array.from(list)) {
      if (!PHOTO_ACCEPT.split(',').includes(file.type)) {
        toast.error(`${file.name}: must be JPEG, PNG, or WebP`);
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        toast.error(`${file.name}: must be 8MB or smaller`);
        continue;
      }
      next.push(file);
    }
    setPhotos(next);
  };

  const handleSubmit = async () => {
    if (!vehicleId) {
      toast.error('No vehicle linked to this job');
      return;
    }
    try {
      const result = await create.mutateAsync({
        vehicleId,
        dispatchId,
        ...checks,
        notes: notes.trim() || undefined,
        odometerKm: odometerKm ? Number(odometerKm) : undefined,
      });
      if (isOfflineQueuedResult(result)) {
        onOpenChange(false);
        return;
      }
      for (const file of photos) {
        await uploadPhoto.mutateAsync({ inspectionId: result.id, file });
      }
      toast.success('Inspection submitted');
      onOpenChange(false);
      setNotes('');
      setOdometerKm('');
      setPhotos([]);
    } catch (err) {
      toast.error(describeError(err, 'Failed to submit inspection'));
    }
  };

  const busy = create.isPending || uploadPhoto.isPending;

  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Vehicle inspection</SheetTitle>
          <SheetDescription>Quick pre-trip checklist for your assigned vehicle.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 pb-8">
          <ul className="space-y-2">
            {CHECKS.map((c) => (
              <li key={c.key} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                <Checkbox
                  id={`insp-${c.key}`}
                  checked={checks[c.key]}
                  onCheckedChange={(v) =>
                    setChecks((prev) => ({ ...prev, [c.key]: v === true }))
                  }
                />
                <Label htmlFor={`insp-${c.key}`} className="cursor-pointer text-sm font-medium">
                  {c.label} OK
                </Label>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <Label htmlFor="insp-odo">Odometer (km)</Label>
            <Input
              id="insp-odo"
              type="number"
              min={0}
              step={0.1}
              value={odometerKm}
              onChange={(e) => setOdometerKm(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="insp-notes">Notes</Label>
            <Textarea id="insp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="insp-photos">Photos</Label>
            <Input
              id="insp-photos"
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              onChange={(e) => onAddPhotos(e.target.files)}
            />
            {previews.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((src) => (
                  <img key={src} src={src} alt="" className="h-20 w-full rounded-lg border border-border object-cover" />
                ))}
              </div>
            ) : null}
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void handleSubmit()}>
            {busy ? 'Submitting…' : 'Submit inspection'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
