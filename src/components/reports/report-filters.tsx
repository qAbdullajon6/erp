"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currencyOrder } from "@/lib/currency";
import { orderStatusMeta, orderStatusOrder, invoiceStatusMeta, invoiceStatusOrder } from "@/lib/status-meta";
import { routeLabel, isDefaultFilters, type ReportFilterState } from "@/lib/reports-data";
import { useAppData } from "@/lib/store";
import { DateRangeFilter, type CustomRange } from "@/components/finance/date-range-filter";
import type { DateRangeOption } from "@/lib/date-range";

export function ReportFilters({
  dateOption,
  onDateOptionChange,
  custom,
  onCustomChange,
  filters,
  onFiltersChange,
  onReset,
}: {
  dateOption: DateRangeOption;
  onDateOptionChange: (o: DateRangeOption) => void;
  custom: CustomRange;
  onCustomChange: (c: CustomRange) => void;
  filters: ReportFilterState;
  onFiltersChange: (f: ReportFilterState) => void;
  onReset: () => void;
}) {
  const { customers, drivers, vehicles, orders } = useAppData();
  const routes = Array.from(new Set(orders.map(routeLabel))).sort();

  function set<K extends keyof ReportFilterState>(key: K, value: ReportFilterState[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  const activeChips: { key: keyof ReportFilterState; label: string }[] = [];
  if (filters.customerId !== "all") {
    activeChips.push({
      key: "customerId",
      label: `Customer: ${customers.find((c) => c.id === filters.customerId)?.name ?? filters.customerId}`,
    });
  }
  if (filters.route !== "all") activeChips.push({ key: "route", label: `Route: ${filters.route}` });
  if (filters.driverId !== "all") {
    activeChips.push({
      key: "driverId",
      label: `Driver: ${drivers.find((d) => d.id === filters.driverId)?.name ?? filters.driverId}`,
    });
  }
  if (filters.vehicleId !== "all") {
    activeChips.push({
      key: "vehicleId",
      label: `Vehicle: ${vehicles.find((v) => v.id === filters.vehicleId)?.plate ?? filters.vehicleId}`,
    });
  }
  if (filters.orderStatus !== "all") {
    activeChips.push({
      key: "orderStatus",
      label: `Order: ${orderStatusMeta[filters.orderStatus as keyof typeof orderStatusMeta].label}`,
    });
  }
  if (filters.invoiceStatus !== "all") {
    activeChips.push({
      key: "invoiceStatus",
      label: `Invoice: ${invoiceStatusMeta[filters.invoiceStatus as keyof typeof invoiceStatusMeta].label}`,
    });
  }
  if (filters.currency !== "all") {
    activeChips.push({ key: "currency", label: `Currency: ${filters.currency}` });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter
          option={dateOption}
          onOptionChange={onDateOptionChange}
          custom={custom}
          onCustomChange={onCustomChange}
        />

        <Select value={filters.customerId} onValueChange={(v) => set("customerId", v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Customer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.route} onValueChange={(v) => set("route", v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Route" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All routes</SelectItem>
            {routes.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.driverId} onValueChange={(v) => set("driverId", v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Driver" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All drivers</SelectItem>
            {drivers.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.vehicleId} onValueChange={(v) => set("vehicleId", v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Vehicle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vehicles</SelectItem>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.plate}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.orderStatus} onValueChange={(v) => set("orderStatus", v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Order status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All order statuses</SelectItem>
            {orderStatusOrder.map((s) => (
              <SelectItem key={s} value={s}>
                {orderStatusMeta[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.invoiceStatus} onValueChange={(v) => set("invoiceStatus", v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Invoice status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All invoice statuses</SelectItem>
            {invoiceStatusOrder.map((s) => (
              <SelectItem key={s} value={s}>
                {invoiceStatusMeta[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.currency} onValueChange={(v) => set("currency", v)}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All currencies</SelectItem>
            {currencyOrder.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!isDefaultFilters(filters) && (
          <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5">
            <X className="size-3.5" />
            Reset filters
          </Button>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {activeChips.map((chip) => (
            <Badge
              key={chip.key}
              variant="outline"
              className="cursor-pointer gap-1"
              onClick={() => set(chip.key, "all")}
            >
              {chip.label}
              <X className="size-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
