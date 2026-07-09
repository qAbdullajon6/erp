import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useRecordPaymentMutation, type PaymentMethod } from '@/lib/api/payments';
import { formatMoney } from '@/lib/format';

interface RecordPaymentDialogProps {
  invoiceId: string;
  balanceDue: string;
  currency: string;
}

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'];

export function RecordPaymentDialog({ invoiceId, balanceDue, currency }: RecordPaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balanceDue);
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  const { mutateAsync, isPending } = useRecordPaymentMutation(invoiceId);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setAmount(balanceDue);
      setMethod('BANK_TRANSFER');
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setReference('');
      setNotes('');
      setFormError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      setFormError('Amount must be greater than 0');
      return;
    }
    if (numericAmount > parseFloat(balanceDue)) {
      setFormError(`Amount cannot exceed the balance due (${formatMoney(balanceDue, currency)})`);
      return;
    }
    try {
      await mutateAsync({
        amount: numericAmount,
        method,
        paymentDate,
        reference: reference || undefined,
        notes: notes || undefined,
      });
      toast.success('Payment recorded');
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment');
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => handleOpenChange(true)}>
        Record Payment
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>Balance due: {formatMoney(balanceDue, currency)}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">Amount *</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={balanceDue}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Method *</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Payment Date</label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Reference</label>
              <Input
                placeholder="Transaction ID, cheque number, etc."
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            {formError && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Recording...' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
