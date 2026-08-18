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
import { useCreateDriverFuelMutation } from '@/lib/api/driver-workspace';
import { isOfflineQueuedResult } from '@/lib/driver/offline-queue';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatchId?: string;
  vehicleId?: string;
}

export function DriverFuelSheet({ open, onOpenChange, dispatchId, vehicleId }: Props) {
  const create = useCreateDriverFuelMutation();
  const [amount, setAmount] = useState('');
  const [liters, setLiters] = useState('');
  const [station, setStation] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async () => {
    const amt = Number(amount);
    const lit = Number(liters);
    if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(lit) || lit <= 0) {
      toast.error('Amount and liters are required');
      return;
    }
    try {
      const result = await create.mutateAsync({
        amount: amt,
        liters: lit,
        station: station.trim() || undefined,
        dispatchId,
        vehicleId,
        odometerKm: odometerKm ? Number(odometerKm) : undefined,
        notes: notes.trim() || undefined,
      });
      if (!isOfflineQueuedResult(result)) toast.success('Fuel logged');
      onOpenChange(false);
      setAmount('');
      setLiters('');
      setStation('');
      setOdometerKm('');
      setNotes('');
    } catch (err) {
      toast.error(describeError(err, 'Failed to log fuel'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Log fuel</SheetTitle>
          <SheetDescription>Record a fuel fill for your vehicle.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 pb-8">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fuel-amt">Amount</Label>
              <Input
                id="fuel-amt"
                type="number"
                min={0.01}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuel-lit">Liters</Label>
              <Input
                id="fuel-lit"
                type="number"
                min={0.01}
                step={0.01}
                value={liters}
                onChange={(e) => setLiters(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fuel-station">Station</Label>
            <Input id="fuel-station" value={station} onChange={(e) => setStation(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fuel-odo">Odometer (km)</Label>
            <Input
              id="fuel-odo"
              type="number"
              min={0}
              step={0.1}
              value={odometerKm}
              onChange={(e) => setOdometerKm(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fuel-notes">Notes</Label>
            <Textarea id="fuel-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button className="w-full" disabled={create.isPending} onClick={() => void handleSubmit()}>
            {create.isPending ? 'Submitting…' : 'Submit fuel'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
