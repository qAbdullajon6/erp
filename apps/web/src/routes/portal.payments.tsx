import { createFileRoute } from '@tanstack/react-router';
import { CustomerPaymentsSummary } from '@/components/customer/customer-payments-summary';

export const Route = createFileRoute('/portal/payments')({
  head: () => ({
    meta: [{ title: 'Payments — Customer Portal' }],
  }),
  component: PortalPaymentsPage,
});

function PortalPaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Payments</h1>
        <p className="mt-1 text-muted-foreground">
          Outstanding balances and payment history for your invoices.
        </p>
      </div>
      <CustomerPaymentsSummary />
    </div>
  );
}
