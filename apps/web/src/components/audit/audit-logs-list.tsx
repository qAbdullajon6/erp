"use client";

import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  useAuditLogsList,
  type AuditLogEntry,
  type ListAuditLogsParams,
} from "@/lib/api/audit-logs";
import { PageHeader } from "@/components/shared/page-header";
import { ListToolbar, FilterSelect } from "@/components/shared/list-toolbar";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/components/shared/list-states";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { SortHeader } from "@/components/shared/sort-header";
import { AuditLogDetail } from "./audit-log-detail";

const ENTITY_TYPES = [
  "User",
  "Organization",
  "Customer",
  "Driver",
  "Vehicle",
  "Order",
  "Dispatch",
  "Invoice",
  "Payment",
  "Expense",
  "Billing",
  "DeliveryProof",
];

interface ListSearchState {
  page?: number;
  search?: string;
  action?: string;
  entityType?: string;
  sortBy?: "createdAt" | "action" | "entityType";
  sortOrder?: "asc" | "desc";
}

function formatAction(action: string): string {
  return action
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditLogsList() {
  const navigate = useNavigate();
  const searchState = useSearch({ from: "/app/audit-logs/" }) as ListSearchState;

  const page = searchState.page || 1;
  const search = searchState.search || "";
  const action = searchState.action || "";
  const entityType = searchState.entityType || "";
  const sortBy = searchState.sortBy || "createdAt";
  const sortOrder = searchState.sortOrder || "desc";

  const params: ListAuditLogsParams = {
    page,
    limit: 20,
    search: search || undefined,
    action: action || undefined,
    entityType: entityType || undefined,
    sortBy,
    sortOrder,
  };

  const { data, meta, loading, error, refetch } = useAuditLogsList(params);

  const [localSearch, setLocalSearch] = useState(search);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    refetch(params);
  }, [page, search, action, entityType, sortBy, sortOrder, refetch]);

  const updateSearch = (patch: Partial<ListSearchState>) => {
    navigate({
      to: "/app/audit-logs",
      search: { page: 1, search, action, entityType, sortBy, sortOrder, ...patch },
    });
  };

  const handleSearch = (value: string) => {
    setLocalSearch(value);
    updateSearch({ page: 1, search: value || undefined });
  };

  const handleActionFilter = (value: string) => {
    updateSearch({ page: 1, action: value || undefined });
  };

  const handleEntityTypeFilter = (value: string) => {
    updateSearch({ page: 1, entityType: value || undefined });
  };

  const handleSort = (field: "createdAt" | "action" | "entityType") => {
    const newOrder = sortBy === field && sortOrder === "asc" ? "desc" : "asc";
    navigate({
      to: "/app/audit-logs",
      search: { page, search, action, entityType, sortBy: field, sortOrder: newOrder },
    });
  };

  const handlePageChange = (newPage: number) => {
    navigate({
      to: "/app/audit-logs",
      search: { page: newPage, search, action, entityType, sortBy, sortOrder },
    });
  };

  const sortProps = { activeField: sortBy, order: sortOrder, onSort: handleSort };

  return (
    <div className="space-y-6" data-testid="audit-logs-page">
      <PageHeader
        title="Audit Log"
        subtitle={
          loading
            ? "Loading..."
            : error
              ? "Error loading audit logs"
              : `${meta.total} entries`
        }
      />

      <ListToolbar
        searchValue={localSearch}
        onSearchChange={handleSearch}
        searchPlaceholder="Search actions, entities, actors..."
        searchTestId="audit-search-input"
      >
        <FilterSelect
          label="Action"
          value={action}
          onChange={handleActionFilter}
          testId="audit-action-filter"
        >
          <option value="">All Actions</option>
          <option value="auth.login">Login</option>
          <option value="auth.register">Register</option>
          <option value="customer.create">Customer Create</option>
          <option value="customer.update">Customer Update</option>
          <option value="customer.archive">Customer Archive</option>
          <option value="order.create">Order Create</option>
          <option value="order.assign">Order Assign</option>
          <option value="order.status_change">Order Status Change</option>
          <option value="order.cancel">Order Cancel</option>
          <option value="dispatch.create">Dispatch Create</option>
          <option value="dispatch.status_change">Dispatch Status Change</option>
          <option value="dispatch.reassign">Dispatch Reassign</option>
          <option value="dispatch.cancel">Dispatch Cancel</option>
          <option value="driver.create">Driver Create</option>
          <option value="invoice.create">Invoice Create</option>
          <option value="invoice.send">Invoice Send</option>
          <option value="invoice.cancel">Invoice Cancel</option>
          <option value="expense.create">Expense Create</option>
          <option value="expense.approve">Expense Approve</option>
          <option value="payment.record">Payment Record</option>
          <option value="billing.change_plan">Change Plan</option>
          <option value="billing.cancel_subscription">Cancel Subscription</option>
          <option value="delivery_proof.upload">Delivery Proof Upload</option>
        </FilterSelect>

        <FilterSelect
          label="Entity"
          value={entityType}
          onChange={handleEntityTypeFilter}
          testId="audit-entity-filter"
        >
          <option value="">All Entities</option>
          {ENTITY_TYPES.map((et) => (
            <option key={et} value={et}>
              {et}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {loading && <LoadingState label="Loading audit logs..." />}

        {error && !loading && (
          <ErrorState message={error} onRetry={() => refetch()} />
        )}

        {!loading && !error && data.length === 0 && (
          <EmptyState
            title="No audit entries found"
            description="Audit entries will appear here as users perform actions."
          />
        )}

        {!loading && !error && data.length > 0 && (
          <div className="overflow-x-auto">
            <Table data-testid="audit-table">
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>
                    <SortHeader field="createdAt" label="Time" {...sortProps} />
                  </TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>
                    <SortHeader field="action" label="Action" {...sortProps} />
                  </TableHead>
                  <TableHead>
                    <SortHeader field="entityType" label="Entity" {...sortProps} />
                  </TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => (
                  <TableRow
                    key={entry.id}
                    data-testid="audit-row"
                    className="cursor-pointer hover:bg-brand/5"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatTimestamp(entry.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.actor
                        ? `${entry.actor.firstName} ${entry.actor.lastName}`
                        : "System"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
                        {formatAction(entry.action)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.entityType}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs text-muted-foreground">
                      {entry.entityId || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEntry(entry);
                        }}
                        data-testid="audit-view-button"
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <PaginationBar
        page={meta.page}
        totalPages={meta.totalPages}
        total={meta.total}
        onPageChange={handlePageChange}
        prevTestId="audit-prev-page"
        nextTestId="audit-next-page"
      />

      {selectedEntry && (
        <AuditLogDetail
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}
