"use client";

import * as React from "react";
import { MoreHorizontal, Search } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/mock-data";
import {
  expenseApprovalStatusMeta,
  expenseApprovalStatusOrder,
  expenseCategoryMeta,
  expenseCategoryOrder,
} from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { Expense, ExpenseApprovalStatus, ExpenseCategory } from "@/lib/types";
import { ExpenseFormDialog } from "@/components/finance/expense-form-dialog";
import { DeleteExpenseDialog } from "@/components/finance/delete-expense-dialog";

type CategoryFilter = "all" | ExpenseCategory;
type ApprovalFilter = "all" | ExpenseApprovalStatus;

const PAGE_SIZE = 8;

export function ExpenseList() {
  const { expenses, vehicles, drivers, setExpenseApproval } = useAppData();
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<CategoryFilter>("all");
  const [approvalFilter, setApprovalFilter] = React.useState<ApprovalFilter>("all");
  const [page, setPage] = React.useState(1);
  const [editing, setEditing] = React.useState<Expense | null>(null);
  const [deleting, setDeleting] = React.useState<Expense | null>(null);

  const filtered = expenses
    .filter((e) => (categoryFilter === "all" ? true : e.category === categoryFilter))
    .filter((e) => (approvalFilter === "all" ? true : e.approvalStatus === approvalFilter))
    .filter((e) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        e.id.toLowerCase().includes(q) ||
        (e.payee ?? "").toLowerCase().includes(q) ||
        (e.orderId ?? "").toLowerCase().includes(q) ||
        (e.notes ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search expense, payee, order..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v as CategoryFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {expenseCategoryOrder.map((c) => (
              <SelectItem key={c} value={c}>
                {expenseCategoryMeta[c].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={approvalFilter}
          onValueChange={(v) => {
            setApprovalFilter(v as ApprovalFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Approval" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All approval states</SelectItem>
            {expenseApprovalStatusOrder.map((s) => (
              <SelectItem key={s} value={s}>
                {expenseApprovalStatusMeta[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="sm:ml-auto">
          <ExpenseFormDialog />
        </div>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Vehicle / Driver</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((e) => {
                const vehicle = vehicles.find((v) => v.id === e.vehicleId);
                const driver = drivers.find((d) => d.id === e.driverId);
                const meta = expenseApprovalStatusMeta[e.approvalStatus];
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">{formatDate(e.date)}</TableCell>
                    <TableCell className="font-medium">
                      {expenseCategoryMeta[e.category].label}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(e.amount, e.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{e.payee ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.orderId ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[vehicle?.plate, driver?.name].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={meta.badgeClass}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {e.approvalStatus !== "approved" && (
                            <DropdownMenuItem onClick={() => setExpenseApproval(e.id, "approved")}>
                              Approve
                            </DropdownMenuItem>
                          )}
                          {e.approvalStatus !== "rejected" && (
                            <DropdownMenuItem onClick={() => setExpenseApproval(e.id, "rejected")}>
                              Reject
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setEditing(e)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleting(e)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No expenses match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {filtered.length > 0 && (
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
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

      {editing && (
        <ExpenseFormDialog
          key={editing.id}
          expense={editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
      {deleting && (
        <DeleteExpenseDialog
          expense={deleting}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
