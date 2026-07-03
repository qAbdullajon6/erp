"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import {
  formatDate,
  getCustomer,
  getInvoiceRemaining,
  getInvoiceStatus,
} from "@/lib/mock-data";
import { invoiceStatusMeta, invoiceStatusOrder } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { Invoice, InvoiceStatus } from "@/lib/types";
import { InvoiceFormDialog } from "@/components/finance/invoice-form-dialog";
import { InvoiceDetailSheet } from "@/components/finance/invoice-detail-sheet";

type StatusFilter = "all" | InvoiceStatus;
type SortKey = "issuedAt" | "amount" | "remaining" | "dueAt";

const PAGE_SIZE = 8;

export function InvoiceList() {
  const { invoices, customers } = useAppData();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("issuedAt");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);

  const rows = invoices.map((inv) => ({
    invoice: inv,
    customer: getCustomer(inv.customerId, customers),
    status: getInvoiceStatus(inv),
    remaining: getInvoiceRemaining(inv),
  }));

  const filtered = rows
    .filter((r) => (statusFilter === "all" ? true : r.status === statusFilter))
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.invoice.id.toLowerCase().includes(q) ||
        (r.invoice.orderId ?? "").toLowerCase().includes(q) ||
        (r.customer?.name.toLowerCase().includes(q) ?? false)
      );
    });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "issuedAt":
        cmp = new Date(a.invoice.issuedAt).getTime() - new Date(b.invoice.issuedAt).getTime();
        break;
      case "amount":
        cmp = a.invoice.amount - b.invoice.amount;
        break;
      case "remaining":
        cmp = a.remaining - b.remaining;
        break;
      case "dueAt":
        cmp = new Date(a.invoice.dueAt).getTime() - new Date(b.invoice.dueAt).getTime();
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const liveSelected: Invoice | null = selectedId
    ? (invoices.find((i) => i.id === selectedId) ?? null)
    : null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search invoice, order, customer..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as StatusFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {invoiceStatusOrder.map((s) => (
              <SelectItem key={s} value={s}>
                {invoiceStatusMeta[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="sm:ml-auto">
          <Button className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" />
            New Invoice
          </Button>
        </div>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    className="ml-auto flex items-center hover:text-foreground"
                    onClick={() => toggleSort("amount")}
                  >
                    Amount
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    className="ml-auto flex items-center hover:text-foreground"
                    onClick={() => toggleSort("remaining")}
                  >
                    Remaining
                  </button>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center hover:text-foreground"
                    onClick={() => toggleSort("dueAt")}
                  >
                    Due date
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((r) => {
                const meta = invoiceStatusMeta[r.status];
                return (
                  <TableRow
                    key={r.invoice.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(r.invoice.id)}
                  >
                    <TableCell className="font-medium">{r.invoice.id}</TableCell>
                    <TableCell className="text-muted-foreground">{r.customer?.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.invoice.orderId ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(r.invoice.amount, r.invoice.currency)}
                    </TableCell>
                    <TableCell
                      className={
                        r.remaining > 0
                          ? "text-right font-medium text-destructive"
                          : "text-right text-muted-foreground"
                      }
                    >
                      {formatMoney(r.remaining, r.invoice.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={meta.badgeClass}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.invoice.dueAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No invoices match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {sorted.length > 0 && (
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <InvoiceDetailSheet
        invoice={liveSelected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />

      {showCreate && (
        <InvoiceFormDialog onOpenChange={setShowCreate} onSaved={(id) => setSelectedId(id)} />
      )}
    </div>
  );
}
