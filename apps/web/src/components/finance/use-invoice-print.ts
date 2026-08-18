import { useQuery } from '@tanstack/react-query';
import { customersAPI } from '@/lib/api/customers';
import { ordersAPI } from '@/lib/api/orders';
import { useOrganizationQuery } from '@/lib/api/organizations';
import type { Invoice } from '@/lib/api/invoices';
import { printInvoiceDocument } from './invoice-print';

/// Everything a printed invoice needs, gathered in one place.
///
/// Two screens can print an invoice, and each assembled the context by hand.
/// The finance sheet passed the customer; the order documents panel passed only
/// the organization, so its printed invoice addressed "Bill to" to a raw
/// customer UUID — on the document that goes to the paying customer. A third
/// caller would have had the same coin flip, so the assembly lives here now and
/// callers get a ready-to-use print function.
export function useInvoicePrint(invoice: Invoice | null | undefined) {
  const { data: organization } = useOrganizationQuery();

  const { data: customer } = useQuery({
    queryKey: ['customer-for-invoice', invoice?.customerId],
    queryFn: () => customersAPI.getById(invoice!.customerId),
    enabled: Boolean(invoice?.customerId),
  });

  const { data: order } = useQuery({
    queryKey: ['order-for-invoice', invoice?.orderId],
    queryFn: () => ordersAPI.getOrder(invoice!.orderId!),
    enabled: Boolean(invoice?.orderId),
  });

  return {
    customer,
    order,
    print: () => {
      if (!invoice) return;
      printInvoiceDocument({
        invoice,
        organization,
        customerName: customer?.companyName,
        customerAddress: customer?.address,
        customerCity: customer?.city,
        customerCountry: customer?.country,
        orderNumber: order?.orderNumber,
      });
    },
  };
}
