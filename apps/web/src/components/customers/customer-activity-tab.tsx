"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, getCustomerActivity } from "@/lib/mock-data";
import { useAppData } from "@/lib/store";
import type { Customer } from "@/lib/types";

export function CustomerActivityTab({ customer }: { customer: Customer }) {
  const { orders, invoices, customerNotes, addCustomerNote } = useAppData();
  const [note, setNote] = React.useState("");

  const activity = getCustomerActivity(customer, orders, invoices, customerNotes);

  function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    addCustomerNote(customer.id, note.trim());
    setNote("");
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleAddNote} className="space-y-2">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note about this customer..."
          rows={2}
        />
        <div className="flex justify-end">
          <Button size="sm" type="submit" disabled={!note.trim()}>
            Add Note
          </Button>
        </div>
      </form>

      <ol className="space-y-4">
        {activity.map((event, i) => (
          <li key={event.id} className="flex items-start gap-3">
            <div
              className={
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full " +
                (i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
              }
            >
              <Clock className="size-3" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{event.label}</p>
              <p className="text-xs text-muted-foreground">{event.description}</p>
              <p className="text-[11px] text-muted-foreground">{formatDateTime(event.at)}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
