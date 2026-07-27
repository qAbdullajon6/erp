'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { ListToolbar, FilterSelect } from '@/components/shared/list-toolbar';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  usePlatformOrganizationsQuery,
  type OrganizationStatus,
} from '@/lib/api/platform';
import { formatDate, formatMoney } from '@/lib/format';

const STATUSES: OrganizationStatus[] = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'];

export function OrganizationsList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrganizationStatus | ''>('');

  const { data, isLoading, isError, error, refetch } = usePlatformOrganizationsQuery({
    page,
    limit: 20,
    search: search || undefined,
    status: status || undefined,
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        subtitle={
          isLoading ? 'Loading…' : isError ? 'Error loading organizations' : `${meta?.total ?? 0} organizations`
        }
      />

      <ListToolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Name or slug…"
      >
        <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => {
            setStatus(value as OrganizationStatus | '');
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {isLoading && <LoadingState label="Loading organizations…" />}
        {isError && !isLoading && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load organizations'}
            onRetry={() => refetch()}
          />
        )}
        {!isLoading && !isError && items.length === 0 && (
          <EmptyState
            title="No organizations"
            description={search || status ? 'No organization matches the current filters.' : 'No tenants yet.'}
          />
        )}
        {!isLoading && !isError && items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>Organization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>MRR</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Fleet</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <Link
                        to="/platform/organizations/$orgId"
                        params={{ orgId: org.id }}
                        className="font-medium text-foreground hover:text-brand"
                      >
                        {org.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{org.slug}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={org.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {org.plan?.name ?? '—'}
                      {org.subscriptionStatus ? (
                        <span className="ml-1 text-xs">({org.subscriptionStatus})</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatMoney(org.mrrCents / 100)}</TableCell>
                    <TableCell className="tabular-nums">{org.memberCount}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {org.driverCount}d / {org.vehicleCount}v
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(org.createdAt)}
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
        />
      )}
    </div>
  );
}
