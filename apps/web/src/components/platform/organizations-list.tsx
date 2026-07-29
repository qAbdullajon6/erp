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
import { formatDate, formatMoney, formatRelativeTime } from '@/lib/format';

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
    <div className="space-y-4 sm:space-y-6">
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
            <Table className="w-full">
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>Organization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Plan</TableHead>
                  <TableHead className="hidden xl:table-cell">MRR</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Drivers</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Vehicles</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Orders</TableHead>
                  <TableHead className="hidden xl:table-cell">Last Activity</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
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
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {org.plan?.name ?? '—'}
                      {org.subscriptionStatus ? (
                        <span className="ml-1 text-xs">({org.subscriptionStatus})</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden tabular-nums xl:table-cell">
                      {formatMoney(org.mrrCents / 100)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{org.memberCount}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {org.driverCount}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {org.vehicleCount}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {org.orderCount}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground xl:table-cell">
                      {org.lastActivityAt ? formatRelativeTime(org.lastActivityAt) : '—'}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
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
