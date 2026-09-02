'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { describeError } from '@/lib/api/describe-error';
import {
  driverWorkspaceAPI,
  useCreateDriverExpenseMutation,
  useDeleteExpenseReceiptMutation,
  useUploadExpenseReceiptMutation,
  type ExpenseCategory,
} from '@/lib/api/driver-workspace';
import { isOfflineQueuedResult } from '@/lib/driver/offline-queue';

const CATEGORIES: ExpenseCategory[] = [
  'FUEL',
  'TOLL',
  'MAINTENANCE',
  'DRIVER_ADVANCE',
  'PARKING',
  'INSURANCE',
  'OTHER',
];

const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_RECEIPT_BYTES = 8_000_000;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatchId?: string;
  vehicleId?: string;
}

export function DriverExpenseSheet({ open, onOpenChange, dispatchId, vehicleId }: Props) {
  const create = useCreateDriverExpenseMutation();
  const uploadReceipt = useUploadExpenseReceiptMutation();
  const deleteReceipt = useDeleteExpenseReceiptMutation();
  const [category, setCategory] = useState<ExpenseCategory>('TOLL');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [createdExpenseId, setCreatedExpenseId] = useState<string | null>(null);

  useEffect(() => {
    if (!receiptFile) {
      setPreviewUrl(null);
      return;
    }
    if (receiptFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(receiptFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [receiptFile]);

  const reset = () => {
    setDescription('');
    setAmount('');
    setNotes('');
    setOdometerKm('');
    setReceiptFile(null);
    setCreatedExpenseId(null);
  };

  const onPickReceipt = (file: File | null) => {
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!RECEIPT_ACCEPT.split(',').includes(file.type)) {
      toast.error('Receipt must be JPEG, PNG, WebP, or PDF');
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      toast.error('Receipt must be 8MB or smaller');
      return;
    }
    setReceiptFile(file);
  };

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!description.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast.error('Description and a valid amount are required');
      return;
    }
    try {
      const result = await create.mutateAsync({
        category,
        description: description.trim(),
        amount: amt,
        notes: notes.trim() || undefined,
        dispatchId,
        vehicleId,
        odometerKm: odometerKm ? Number(odometerKm) : undefined,
      });
      if (isOfflineQueuedResult(result)) {
        onOpenChange(false);
        reset();
        return;
      }
      setCreatedExpenseId(result.id);
      if (receiptFile) {
        await uploadReceipt.mutateAsync({ expenseId: result.id, file: receiptFile });
      }
      toast.success('Expense submitted');
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(describeError(err, 'Failed to submit expense'));
    }
  };

  const busy = create.isPending || uploadReceipt.isPending || deleteReceipt.isPending;

  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Log expense</SheetTitle>
          <SheetDescription>Submit a trip or day expense for approval.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 pb-8">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-desc">Description</Label>
            <Input
              id="exp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-amt">Amount</Label>
            <Input
              id="exp-amt"
              type="number"
              min={0.01}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-odo">Odometer (km)</Label>
            <Input
              id="exp-odo"
              type="number"
              min={0}
              step={0.1}
              value={odometerKm}
              onChange={(e) => setOdometerKm(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-notes">Notes</Label>
            <Textarea id="exp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-receipt">Receipt (image or PDF)</Label>
            <Input
              id="exp-receipt"
              type="file"
              accept={RECEIPT_ACCEPT}
              onChange={(e) => onPickReceipt(e.target.files?.[0] ?? null)}
            />
            {previewUrl ? (
              <img src={previewUrl} alt="Receipt preview" className="mt-2 max-h-40 rounded-lg border border-border object-contain" />
            ) : null}
            {receiptFile && !previewUrl ? (
              <p className="text-xs text-muted-foreground">{receiptFile.name}</p>
            ) : null}
            {receiptFile ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive"
                onClick={() => {
                  setReceiptFile(null);
                  if (createdExpenseId) void deleteReceipt.mutateAsync(createdExpenseId);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove receipt
              </Button>
            ) : null}
            {createdExpenseId ? (
              <a
                className="text-xs font-medium text-brand underline"
                href={driverWorkspaceAPI.receiptUrl(createdExpenseId)}
                target="_blank"
                rel="noreferrer"
              >
                Open uploaded receipt
              </a>
            ) : null}
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void handleSubmit()}>
            {busy ? 'Submitting…' : 'Submit expense'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
