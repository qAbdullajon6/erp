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
import { Plus, Trash2 } from 'lucide-react';
import { customersAPI } from '@/lib/api/customers';
import { ordersAPI } from '@/lib/api/orders';
import { useCreateInvoiceMutation, type InvoiceLineItemInput } from '@/lib/api/invoices';
import { formatMoney } from '@/lib/format';

interface LineItemRow extends InvoiceLineItemInput {
  key: string;
}

function emptyLineItem(): LineItemRow {
  return { key: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0 };
}

export function InvoiceCreateDialog() {
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItemRow[]>([emptyLineItem()]);
  const [formError, setFormError] = useState('');

  const { data: customers } = useQuery({
    queryKey: ['customers-for-invoice'],
    queryFn: () => customersAPI.list({ status: 'ACTIVE', limit: 200 }),
    enabled: open,
  });

  // Only DELIVERED orders can be invoiced (InvoicesService.assertOrderEligibleForInvoice) —
  // the backend still re-validates "no other active invoice" itself, this just narrows the picker.
  const { data: deliverableOrders } = useQuery({
    queryKey: ['orders-deliverable-for-invoice', customerId],
    queryFn: () => ordersAPI.listOrders({ status: 'DELIVERED', customerId: customerId || undefined, limit: 100 }),
    enabled: open,
  });

  const { mutateAsync, isPending } = useCreateInvoiceMutation();

  const resetForm = () => {
    setCustomerId('');
    setOrderId('');
    setDueDate('');
    setCurrency('USD');
    setDiscountAmount(0);
    setTaxAmount(0);
    setNotes('');
    setLineItems([emptyLineItem()]);
    setFormError('');
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetForm();
  };

  const updateLineItem = (key: string, patch: Partial<InvoiceLineItemInput>) => {
    setLineItems((prev) => prev.map((li) => (li.key === key ? { ...li, ...patch } : li)));
  };

  const addLineItem = () => setLineItems((prev) => [...prev, emptyLineItem()]);
  const removeLineItem = (key: string) =>
    setLineItems((prev) => (prev.length > 1 ? prev.filter((li) => li.key !== key) : prev));

  const subtotal = lineItems.reduce((sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0), 0);
  const total = subtotal - discountAmount + taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!customerId) {
      setFormError('Select a customer');
      return;
    }
    const cleanLineItems = lineItems
      .map((li) => ({ description: li.description.trim(), quantity: Number(li.quantity), unitPrice: Number(li.unitPrice) }))
      .filter((li) => li.description);
    if (cleanLineItems.length === 0) {
      setFormError('Add at least one line item with a description');
      return;
    }
    if (cleanLineItems.some((li) => !li.quantity || li.quantity <= 0 || li.unitPrice < 0)) {
      setFormError('Each line item needs a quantity greater than 0 and a non-negative unit price');
      return;
    }

    try {
      await mutateAsync({
        customerId,
        orderId: orderId || undefined,
        dueDate: dueDate || undefined,
        currency,
        lineItems: cleanLineItems,
        discountAmount: discountAmount || undefined,
        taxAmount: taxAmount || undefined,
        notes: notes || undefined,
      });
      toast.success('Invoice created');
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice');
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90">
        <Plus className="h-4 w-4" />
        New Invoice
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
          <DialogDescription>Bill a customer directly, or link this invoice to a delivered order.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-foreground">Customer *</label>
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setOrderId('');
                }}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a customer</option>
                {customers?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Link to Order (optional)</label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                disabled={!customerId}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="">No linked order</option>
                {deliverableOrders?.items.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} — {o.pickupCity} → {o.deliveryCity}
                  </option>
                ))}
              </select>
              {customerId && deliverableOrders && deliverableOrders.items.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">No delivered orders available to invoice for this customer.</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-foreground">Due Date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Currency</label>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Line Items *</label>
              <Button type="button" size="sm" variant="outline" onClick={addLineItem} className="gap-1">
                <Plus className="h-3.5 w-3.5" />
                Add line
              </Button>
            </div>
            <div className="space-y-2">
              {lineItems.map((li) => (
                <div key={li.key} className="grid grid-cols-12 items-start gap-2">
                  <Input
                    placeholder="Description"
                    value={li.description}
                    onChange={(e) => updateLineItem(li.key, { description: e.target.value })}
                    className="col-span-6"
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    min="0.01"
                    step="0.01"
                    value={li.quantity}
                    onChange={(e) => updateLineItem(li.key, { quantity: parseFloat(e.target.value) || 0 })}
                    className="col-span-2"
                  />
                  <Input
                    type="number"
                    placeholder="Unit price"
                    min="0"
                    step="0.01"
                    value={li.unitPrice}
                    onChange={(e) => updateLineItem(li.key, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="col-span-3"
                  />
                  <button
                    type="button"
                    onClick={() => removeLineItem(li.key)}
                    disabled={lineItems.length === 1}
                    className="col-span-1 flex h-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-foreground">Discount</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Tax</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={taxAmount}
                onChange={(e) => setTaxAmount(parseFloat(e.target.value) || 0)}
                className="mt-1"
              />
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

          <div className="rounded-lg bg-background/60 p-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span>-{formatMoney(discountAmount, currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span>+{formatMoney(taxAmount, currency)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-brand/10 pt-2 font-semibold text-foreground">
              <span>Total</span>
              <span>{formatMoney(total, currency)}</span>
            </div>
          </div>

          {formError && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="bg-gradient-brand text-brand-foreground hover:opacity-90">
              {isPending ? 'Creating...' : 'Create Invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>
    </>
  );
}
