"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  customers,
  formatCurrency,
  getCustomerLifetimeValue,
  getCustomerOrders,
  getCustomerOutstandingBalance,
} from "@/lib/mock-data";
import { useAppData } from "@/lib/store";
import type { Customer } from "@/lib/types";
import { CustomerDetailSheet } from "@/components/customers/customer-detail-sheet";

export function CustomersView() {
  const { orders, invoices } = useAppData();
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Customer | null>(null);

  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.industry.toLowerCase().includes(q) ||
      c.contactPerson.toLowerCase().includes(q)
    );
  });

  const liveSelected = selected ? (customers.find((c) => c.id === selected.id) ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search customer, city, contact..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>City / Industry</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Total spend</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((customer) => {
                const orderCount = getCustomerOrders(customer.id, orders).length;
                const spend = getCustomerLifetimeValue(customer.id, orders);
                const outstanding = getCustomerOutstandingBalance(customer.id, invoices);
                return (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(customer)}
                  >
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {customer.contactPerson}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {customer.city} · {customer.industry}
                    </TableCell>
                    <TableCell className="text-right">{orderCount}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(spend)}
                    </TableCell>
                    <TableCell
                      className={
                        outstanding > 0
                          ? "text-right font-medium text-destructive"
                          : "text-right text-muted-foreground"
                      }
                    >
                      {formatCurrency(outstanding)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No customers match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CustomerDetailSheet
        customer={liveSelected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
