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
import { useAppData } from "@/lib/store";
import type { Invoice, Payment } from "@/lib/types";

export function DeletePaymentDialog({
  invoice,
  payment,
  onOpenChange,
}: {
  invoice: Invoice;
  payment: Payment;
  onOpenChange: (open: boolean) => void;
}) {
  const { deletePayment } = useAppData();

  function handleConfirm() {
    deletePayment(invoice.id, payment.id);
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Payment</DialogTitle>
          <DialogDescription>
            {formatMoney(payment.amount, payment.currency)} on {invoice.id} will be removed and
            the invoice balance/status will recalculate immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" className="text-destructive" onClick={handleConfirm}>
            Delete Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
