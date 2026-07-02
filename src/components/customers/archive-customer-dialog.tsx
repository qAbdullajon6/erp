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
import { useAppData } from "@/lib/store";
import type { Customer } from "@/lib/types";

export function ArchiveCustomerDialog({
  customer,
  onOpenChange,
}: {
  customer: Customer;
  onOpenChange: (open: boolean) => void;
}) {
  const { setCustomerStatus } = useAppData();
  const isArchived = customer.status === "archived";

  function handleConfirm() {
    setCustomerStatus(customer.id, isArchived ? "active" : "archived");
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isArchived ? "Restore Customer" : "Archive Customer"}</DialogTitle>
          <DialogDescription>
            {isArchived
              ? `${customer.name} will become active again and reappear in the default customer list.`
              : `${customer.name} will be archived. Their orders and invoices are kept, but they'll be hidden from the default customer list and won't be selectable for new orders. Customers with existing orders or invoices can't be permanently deleted — archiving is the safe alternative.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={isArchived ? "default" : "outline"}
            className={isArchived ? "" : "text-destructive"}
            onClick={handleConfirm}
          >
            {isArchived ? "Restore" : "Archive Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
