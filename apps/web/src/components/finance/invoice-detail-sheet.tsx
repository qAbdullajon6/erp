import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useInvoiceQuery, useSendInvoiceMutation, useCancelInvoiceMutation, type InvoiceStatus } from '@/lib/api/invoices';
import { customersAPI } from '@/lib/api/customers';
import { ordersAPI } from '@/lib/api/orders';
import { formatMoney } from '@/lib/format';
import { RecordPaymentDialog } from './record-payment-dialog';

interface InvoiceDetailSheetProps {
  invoiceId: string | null;
  onOpenChange: (open: boolean) => void;
}

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SENT: 'bg-blue-100 text-blue-800',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-green-100 text-green-800',
  OVERDUE: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export function InvoiceDetailSheet({ invoiceId, onOpenChange }: InvoiceDetailSheetProps) {
  const open = !!invoiceId;
  const { data: invoice, isLoading, isError, error, refetch } = useInvoiceQuery(invoiceId ?? '');

  const { data: customer } = useQuery({
    queryKey: ['customer-for-invoice', invoice?.customerId],
    queryFn: () => customersAPI.getById(invoice!.customerId),
    enabled: !!invoice?.customerId,
  });

  const { data: order } = useQuery({
    queryKey: ['order-for-invoice', invoice?.orderId],
    queryFn: () => ordersAPI.getOrder(invoice!.orderId!),
    enabled: !!invoice?.orderId,
  });

  const { mutateAsync: sendInvoice, isPending: sending } = useSendInvoiceMutation(invoiceId ?? '');
  const { mutateAsync: cancelInvoice, isPending: cancelling } = useCancelInvoiceMutation(invoiceId ?? '');

  const handleSend = async () => {
    try {
      await sendInvoice();
      toast.success('Invoice sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invoice');
    }
  };

  const handleCancel = async () => {
    try {
      await cancelInvoice();
      toast.success('Invoice cancelled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel invoice');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {isLoading && (
          <div className="space-y-4 pt-6">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {isError && (
          <div className="mt-6 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load invoice'}
            <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-2">
              Retry
            </Button>
          </div>
        )}

        {invoice && (
          <div className="space-y-6">
            <SheetHeader>
              <div className="flex items-center gap-3">
                <SheetTitle>{invoice.invoiceNumber}</SheetTitle>
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[invoice.status]}`}>
                  {invoice.status.replace(/_/g, ' ')}
                </span>
              </div>
              <SheetDescription>{customer?.companyName ?? invoice.customerId}</SheetDescription>
            </SheetHeader>

            {order && (
              <div className="text-sm">
                <span className="text-muted-foreground">Linked order: </span>
                <Link to="/app/orders/$orderId" params={{ orderId: order.id }} className="text-brand hover:underline">
                  {order.orderNumber}
                </Link>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Issue Date</p>
                <p className="font-medium text-foreground">{new Date(invoice.issueDate).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Due Date</p>
                <p className="font-medium text-foreground">
                  {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-brand/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand/10 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand/10">
                  {invoice.lineItems?.map((li) => (
                    <tr key={li.id}>
                      <td className="px-3 py-2">{li.description}</td>
                      <td className="px-3 py-2 text-right">{li.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(li.unitPrice, invoice.currency)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(li.lineTotal, invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg bg-background/60 p-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatMoney(invoice.subtotal, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span>-{formatMoney(invoice.discountAmount, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span>+{formatMoney(invoice.taxAmount, invoice.currency)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-brand/10 pt-2 font-semibold text-foreground">
                <span>Total</span>
                <span>{formatMoney(invoice.totalAmount, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-success">
                <span>Paid</span>
                <span>{formatMoney(invoice.paidAmount, invoice.currency)}</span>
              </div>
              <div className="flex justify-between font-medium text-foreground">
                <span>Balance Due</span>
                <span>{formatMoney(invoice.balanceDue, invoice.currency)}</span>
              </div>
            </div>

            {invoice.notes && (
              <div>
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="text-sm text-foreground">{invoice.notes}</p>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Payment History</h3>
              {invoice.payments && invoice.payments.length > 0 ? (
                <div className="space-y-2">
                  {invoice.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-foreground">{formatMoney(p.amount, p.currency)}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.method.replace(/_/g, ' ')} · {new Date(p.paymentDate).toLocaleDateString()}
                          {p.reference ? ` · ${p.reference}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-brand/10 pt-4">
              {invoice.status === 'DRAFT' && (
                <Button size="sm" onClick={handleSend} disabled={sending}>
                  {sending ? 'Sending...' : 'Send Invoice'}
                </Button>
              )}
              {invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED' && Number(invoice.balanceDue) > 0 && (
                <RecordPaymentDialog invoiceId={invoice.id} balanceDue={invoice.balanceDue} currency={invoice.currency} />
              )}
              {invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
                <Button size="sm" variant="destructive" onClick={handleCancel} disabled={cancelling}>
                  {cancelling ? 'Cancelling...' : 'Cancel Invoice'}
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
