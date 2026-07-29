import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/lib/api/auth';
import { useInvoiceQuery, useSendInvoiceMutation, useCancelInvoiceMutation } from '@/lib/api/invoices';
import { customersAPI } from '@/lib/api/customers';
import { ordersAPI } from '@/lib/api/orders';
import type { MembershipRole } from '@/lib/api/organizations';
import { formatMoney } from '@/lib/format';
import { INVOICE_FINALIZE_ROLES } from '@/lib/role-access';
import { ErrorState } from '@/components/shared/list-states';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { RecordPaymentDialog } from './record-payment-dialog';
import { printInvoiceDocument } from './invoice-print';

interface InvoiceDetailSheetProps {
  invoiceId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceDetailSheet({ invoiceId, onOpenChange }: InvoiceDetailSheetProps) {
  const open = !!invoiceId;
  const { data: currentUser } = useCurrentUser();
  const canFinalize = Boolean(
    currentUser && INVOICE_FINALIZE_ROLES.includes(currentUser.membership.role as MembershipRole),
  );
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
      toast.success('Invoice marked as sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark invoice as sent');
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
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load invoice'}
            onRetry={() => refetch()}
          />
        )}

        {invoice && (
          <div className="space-y-6">
            <SheetHeader>
              <div className="flex items-center gap-3">
                <SheetTitle>{invoice.invoiceNumber}</SheetTitle>
                <StatusBadge status={invoice.status} />
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
                  {invoice.lineItems?.map((li, idx) => (
                    <tr key={li.id || `line-${idx}`}>
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
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  printInvoiceDocument({
                    invoice,
                    organizationName: currentUser?.organization.name,
                    customerName: customer?.companyName,
                    customerAddress: customer?.address,
                    customerCity: customer?.city,
                    customerCountry: customer?.country,
                    orderNumber: order?.orderNumber,
                  })
                }
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print / Save PDF
              </Button>
              {canFinalize && invoice.status === 'DRAFT' && (
                <Button size="sm" onClick={handleSend} disabled={sending}>
                  {sending ? 'Updating...' : 'Mark as sent'}
                </Button>
              )}
              {canFinalize && invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED' && Number(invoice.balanceDue) > 0 && (
                <RecordPaymentDialog invoiceId={invoice.id} balanceDue={invoice.balanceDue} currency={invoice.currency} />
              )}
              {canFinalize && invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="destructive" disabled={cancelling}>
                      {cancelling ? 'Cancelling...' : 'Cancel Invoice'}
                    </Button>
                  }
                  title="Cancel this invoice?"
                  description="Cancelled invoices cannot be sent or receive payments. This cannot be undone from the UI."
                  confirmLabel="Cancel invoice"
                  destructive
                  onConfirm={() => {
                    void handleCancel();
                  }}
                />
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
