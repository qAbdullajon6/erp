import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { usePortalInvoicesList, type PortalInvoiceStatus } from "@/lib/api/portal-invoices";
import { formatMoney, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/portal/invoices")({
  head: () => ({
    meta: [{ title: "Invoices — Customer Portal" }],
  }),
  component: PortalInvoicesPage,
});

const STATUS_OPTIONS: { value: PortalInvoiceStatus | ""; label: string }[] = [
  { value: "", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELLED", label: "Cancelled" },
];

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

function PortalInvoicesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PortalInvoiceStatus | "">("");
  const limit = 20;

  const { data: invoices, meta, loading, error, refetch } = usePortalInvoicesList({
    page,
    limit,
    status: status || undefined,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Invoices</h1>
        <p className="mt-1 text-muted-foreground">View and manage your invoices.</p>
      </div>

      <div className="flex items-center gap-3">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as PortalInvoiceStatus | "");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border/60 bg-surface/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issue Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Balance Due</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-5 animate-pulse rounded bg-primary/10" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-destructive">
                  {error}{' '}
                  <button onClick={() => refetch()} className="font-semibold underline hover:no-underline">
                    Retry
                  </button>
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No invoices found.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                  <TableCell>
                    <StatusBadge status={invoice.status} />
                  </TableCell>
                  <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                  <TableCell>{invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</TableCell>
                  <TableCell>{formatMoney(invoice.totalAmount, invoice.currency)}</TableCell>
                  <TableCell>{formatMoney(invoice.balanceDue, invoice.currency)}</TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/portal/invoices/$invoiceId" params={{ invoiceId: invoice.id }}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta.totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            {Array.from({ length: meta.totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === meta.totalPages || Math.abs(p - page) <= 2)
              .map((p, idx, arr) => (
                <PaginationItem key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span className="flex h-9 w-9 items-center justify-center">…</span>
                  )}
                  <PaginationLink
                    isActive={p === page}
                    onClick={() => setPage(p)}
                    className="cursor-pointer"
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                className={page >= meta.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
