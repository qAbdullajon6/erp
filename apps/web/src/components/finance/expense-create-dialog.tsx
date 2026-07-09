import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Plus } from 'lucide-react';
import { ordersAPI } from '@/lib/api/orders';
import { driversAPI } from '@/lib/api/drivers';
import { vehiclesAPI } from '@/lib/api/vehicles';
import { useCreateExpenseMutation, type ExpenseCategory } from '@/lib/api/expenses';

const CATEGORIES: ExpenseCategory[] = ['FUEL', 'TOLL', 'MAINTENANCE', 'DRIVER_ADVANCE', 'PARKING', 'INSURANCE', 'OTHER'];

export function ExpenseCreateDialog() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('FUEL');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [orderId, setOrderId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  const { data: orders } = useQuery({
    queryKey: ['orders-for-expense'],
    queryFn: () => ordersAPI.listOrders({ limit: 100, sortBy: 'createdAt', sortOrder: 'desc' }),
    enabled: open,
  });
  const { data: vehicles } = useQuery({
    queryKey: ['vehicles-for-expense'],
    queryFn: () => vehiclesAPI.list({ limit: 100 }),
    enabled: open,
  });
  const { data: drivers } = useQuery({
    queryKey: ['drivers-for-expense'],
    queryFn: () => driversAPI.list({ limit: 100 }),
    enabled: open,
  });

  const { mutateAsync, isPending } = useCreateExpenseMutation();

  const resetForm = () => {
    setCategory('FUEL');
    setDescription('');
    setAmount('');
    setCurrency('USD');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setOrderId('');
    setVehicleId('');
    setDriverId('');
    setNotes('');
    setFormError('');
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!description.trim()) {
      setFormError('Description is required');
      return;
    }
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      setFormError('Amount must be greater than 0');
      return;
    }

    try {
      await mutateAsync({
        category,
        description: description.trim(),
        amount: numericAmount,
        currency,
        expenseDate: expenseDate || undefined,
        orderId: orderId || undefined,
        vehicleId: vehicleId || undefined,
        driverId: driverId || undefined,
        notes: notes || undefined,
      });
      toast.success('Expense created');
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create expense');
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90">
        <Plus className="h-4 w-4" />
        Add Expense
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>New expenses start as PENDING and need approval before they count toward profitability.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Date</label>
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="mt-1" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Description *</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="mt-1" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">Amount *</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Currency</label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className="mt-1" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-foreground">Order</label>
                <select
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {orders?.items.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Vehicle</label>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {vehicles?.items.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Driver</label>
                <select
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {drivers?.items.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.firstName} {d.lastName}
                    </option>
                  ))}
                </select>
              </div>
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
              <Button type="submit" disabled={isPending} className="bg-gradient-brand text-brand-foreground hover:opacity-90">
                {isPending ? 'Saving...' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
