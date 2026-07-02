"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/currency";
import { expenseCategoryMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { Expense } from "@/lib/types";

export function DeleteExpenseDialog({
  expense,
  onOpenChange,
}: {
  expense: Expense;
  onOpenChange: (open: boolean) => void;
}) {
  const { deleteExpense } = useAppData();

  function handleConfirm() {
    deleteExpense(expense.id);
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Expense</DialogTitle>
          <DialogDescription>
            {expense.id} · {expenseCategoryMeta[expense.category].label} ·{" "}
            {formatMoney(expense.amount, expense.currency)} will be permanently removed. Any
            order/vehicle/driver profitability and dashboard totals that included it will update
            immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" className="text-destructive" onClick={handleConfirm}>
            Delete Expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
