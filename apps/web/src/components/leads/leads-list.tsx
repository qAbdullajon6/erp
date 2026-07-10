'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { ListToolbar, FilterSelect } from '@/components/shared/list-toolbar';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import {
  useLeadsQuery,
  useLeadStatsQuery,
  useUpdateLeadStatusMutation,
  LEAD_STATUSES,
  type LeadStatus,
} from '@/lib/api/leads';
import { Mail, Phone } from 'lucide-react';

const SELECT_CLASS =
  'h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function LeadsList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('');

  const { data, isLoading, isError, error, refetch } = useLeadsQuery({
    page,
    limit: 20,
    search: search || undefined,
    status: statusFilter || undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const { data: counts } = useLeadStatsQuery();
  const { mutate: updateStatus, isPending: updating } = useUpdateLeadStatusMutation();

  const items = data?.items ?? [];
  const meta = data?.meta;

  const handleStatusChange = (id: string, status: LeadStatus) =>
    updateStatus(
      { id, status },
      {
        onSuccess: () => toast.success(`Lead moved to ${statusLabel(status)}`),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update lead'),
      },
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        subtitle={
          isLoading ? 'Loading...' : isError ? 'Error loading leads' : `${meta?.total ?? 0} demo requests`
        }
      />

      {/* Counters stay whole-pipeline even when the table is filtered. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {LEAD_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => {
              setStatusFilter((current) => (current === status ? '' : status));
              setPage(1);
            }}
            className={`rounded-xl border p-4 text-left transition-colors ${
              statusFilter === status
                ? 'border-brand/40 bg-brand/10'
                : 'border-brand/10 bg-surface hover:border-brand/30'
            }`}
          >
            <StatusBadge status={status} />
            <p className="mt-3 text-2xl font-semibold leading-none text-foreground">{counts?.[status] ?? 0}</p>
          </button>
        ))}
      </div>

      <ListToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Company, contact name, or email..."
        searchTestId="leads-search-input"
      >
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value as LeadStatus | '');
            setPage(1);
          }}
          testId="leads-status-filter"
        >
          <option value="">All Statuses</option>
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {isLoading && <LoadingState label="Loading leads..." />}

        {isError && !isLoading && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load leads'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && items.length === 0 && (
          <EmptyState
            title="No leads yet"
            description={
              search || statusFilter
                ? 'No demo request matches the current filters.'
                : 'Demo requests from the marketing site land here.'
            }
          />
        )}

        {!isLoading && !isError && items.length > 0 && (
          <div className="overflow-x-auto">
            <Table data-testid="leads-table">
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((lead) => (
                  <TableRow key={lead.id} data-testid="lead-row">
                    <TableCell className="font-medium text-foreground">{lead.company}</TableCell>

                    <TableCell>
                      <div className="text-foreground">{lead.name}</div>
                      <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                        <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 hover:text-brand">
                          <Mail className="h-3 w-3 shrink-0" />
                          {lead.email}
                        </a>
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 hover:text-brand">
                          <Phone className="h-3 w-3 shrink-0" />
                          {lead.phone}
                        </a>
                      </div>
                    </TableCell>

                    <TableCell className="max-w-xs">
                      <p className="truncate text-muted-foreground" title={lead.message ?? undefined}>
                        {lead.message || '—'}
                      </p>
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(lead.createdAt)}
                    </TableCell>

                    <TableCell>
                      {/* Any status may follow any other — a sales pipeline is
                          not a forward-only state machine. */}
                      <select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                        disabled={updating}
                        aria-label={`Status for ${lead.company}`}
                        data-testid="lead-status-select"
                        className={SELECT_CLASS}
                      >
                        {LEAD_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {meta && (
        <PaginationBar
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={setPage}
          prevTestId="leads-prev-page"
          nextTestId="leads-next-page"
        />
      )}
    </div>
  );
}
