import { createFileRoute, Link } from "@tanstack/react-router";
import { usePortalInvoice } from "@/lib/api/portal-invoices";
import { formatMoney, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Printer } from "lucide-react";

export const Route = createFileRoute("/portal/invoices/$invoiceId")({
  head: () => ({
    meta: [{ title: "Invoice Detail — Customer Portal" }],
  }),
  component: PortalInvoiceDetailPage,
});

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "secondary" | "brand" | "success" | "warning" | "destructive" | "muted"> = {
    DRAFT: "secondary",
    SENT: "brand",
    PARTIALLY_PAID: "warning",
    PAID: "success",
    OVERDUE: "destructive",
    CANCELLED: "muted",
  };
  return <Badge variant={variantMap[status] ?? "secondary"}>{status.replace(/_/g, " ")}</Badge>;
}

function PortalInvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const { data: invoice, loading, error } = usePortalInvoice(invoiceId);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-sm text-destructive">{error || "Invoice not found."}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/portal/invoices">Back to invoices</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/portal/invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">{invoice.invoiceNumber}</h1>
            <p className="mt-1 text-muted-foreground">Invoice details</p>
          </div>
          <StatusBadge status={invoice.status} />
        </div>
        <Button variant="outline" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Issue Date</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{formatDate(invoice.issueDate)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Due Date</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {formatMoney(invoice.totalAmount, invoice.currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      {invoice.lineItems && invoice.lineItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Line Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{formatMoney(item.unitPrice, invoice.currency)}</TableCell>
                    <TableCell className="text-right">{formatMoney(item.lineTotal, invoice.currency)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-medium">Subtotal</TableCell>
                  <TableCell className="text-right">{formatMoney(invoice.subtotal, invoice.currency)}</TableCell>
                </TableRow>
                {Number(invoice.discountAmount) > 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-medium">Discount</TableCell>
                    <TableCell className="text-right text-success">
                      -{formatMoney(invoice.discountAmount, invoice.currency)}
                    </TableCell>
                  </TableRow>
                )}
                {Number(invoice.taxAmount) > 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-medium">Tax</TableCell>
                    <TableCell className="text-right">{formatMoney(invoice.taxAmount, invoice.currency)}</TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatMoney(invoice.totalAmount, invoice.currency)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {invoice.payments && invoice.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell>{payment.method}</TableCell>
                    <TableCell>{payment.reference ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatMoney(payment.amount, payment.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-muted-foreground">Paid Amount</span>
              <span className="font-medium text-success">
                {formatMoney(invoice.paidAmount, invoice.currency)}
              </span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-muted-foreground">Balance Due</span>
              <span className="font-medium text-destructive">
                {formatMoney(invoice.balanceDue, invoice.currency)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
