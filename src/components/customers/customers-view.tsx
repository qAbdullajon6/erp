"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search } from "lucide-react";
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
import {
  formatCurrency,
  getCustomerLifetimeValue,
  getCustomerOrders,
  getCustomerOutstandingBalance,
  getCustomerOverdueBalance,
} from "@/lib/mock-data";
import { customerStatusMeta, customerStatusOrder } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import { useRole } from "@/lib/role";
import { hasCapability } from "@/lib/permissions";
import type { CustomerStatus } from "@/lib/types";
import { CustomerSummaryCards } from "@/components/customers/customer-summary-cards";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { CustomerProfileSheet } from "@/components/customers/customer-profile-sheet";
import { cn } from "@/lib/utils";

type SortKey = "name" | "orders" | "spend" | "outstanding" | "status";
type StatusFilter = "all" | CustomerStatus;

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="size-3.5 text-muted-foreground/50" />;
  return dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
}

const PAGE_SIZE = 8;

export function CustomersView() {
  const { customers, orders, invoices } = useAppData();
  const { role } = useRole();
  const canManageCustomers = hasCapability(role, "manage_customers");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);

  const rows = customers.map((c) => ({
    customer: c,
    orderCount: getCustomerOrders(c.id, orders).length,
    spend: getCustomerLifetimeValue(c.id, orders),
    outstanding: getCustomerOutstandingBalance(c.id, invoices),
    overdue: getCustomerOverdueBalance(c.id, invoices),
  }));

  const filtered = rows
    .filter((r) => (statusFilter === "all" ? r.customer.status !== "archived" : r.customer.status === statusFilter))
    .filter((r) => (overdueOnly ? r.overdue > 0 : true))
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const c = r.customer;
      return (
        c.name.toLowerCase().includes(q) ||
        c.contactPerson.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name":
        cmp = a.customer.name.localeCompare(b.customer.name);
        break;
      case "orders":
        cmp = a.orderCount - b.orderCount;
        break;
      case "spend":
        cmp = a.spend - b.spend;
        break;
      case "outstanding":
        cmp = a.outstanding - b.outstanding;
        break;
      case "status":
        cmp = a.customer.status.localeCompare(b.customer.status);
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const liveSelected = selectedId ? (customers.find((c) => c.id === selectedId) ?? null) : null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <CustomerSummaryCards />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search company, contact, phone, email, city, ID..."
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
            <SelectItem value="all">All (excl. archived)</SelectItem>
            {customerStatusOrder.map((status) => (
              <SelectItem key={status} value={status}>
                {customerStatusMeta[status].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={overdueOnly ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setOverdueOnly((v) => !v);
            setPage(1);
          }}
        >
          Has Overdue Balance
        </Button>

        {canManageCustomers && (
          <div className="sm:ml-auto">
            <Button className="gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="size-4" />
              New Customer
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("name")}
                  >
                    Company <SortIcon active={sortKey === "name"} dir={sortDir} />
                  </button>
                </TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>City / Industry</TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("orders")}
                  >
                    Orders <SortIcon active={sortKey === "orders"} dir={sortDir} />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("spend")}
                  >
                    Total spend <SortIcon active={sortKey === "spend"} dir={sortDir} />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("outstanding")}
                  >
                    Outstanding <SortIcon active={sortKey === "outstanding"} dir={sortDir} />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("status")}
                  >
                    Status <SortIcon active={sortKey === "status"} dir={sortDir} />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((r) => {
                const meta = customerStatusMeta[r.customer.status];
                return (
                  <TableRow
                    key={r.customer.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(r.customer.id)}
                  >
                    <TableCell className="font-medium">{r.customer.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.customer.contactPerson}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.customer.city} · {r.customer.industry}
                    </TableCell>
                    <TableCell className="text-right">{r.orderCount}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(r.spend)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right",
                        r.overdue > 0
                          ? "font-medium text-destructive"
                          : r.outstanding > 0
                            ? "font-medium text-chart-3"
                            : "text-muted-foreground",
                      )}
                    >
                      {formatCurrency(r.outstanding)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={meta.badgeClass}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No customers match your filters.
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

      <CustomerProfileSheet
        customer={liveSelected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />

      {showCreate && (
        <CustomerFormDialog onOpenChange={setShowCreate} onSaved={(id) => setSelectedId(id)} />
      )}
    </div>
  );
}
