'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { usePlatformAuditQuery } from '@/lib/api/platform';
import { formatDate } from '@/lib/format';
import { describeError } from '@/lib/api/describe-error';

export function AuditList() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const { data, isLoading, isError, error, refetch } = usePlatformAuditQuery({
    page,
    limit: 50,
    action: action || undefined,
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit"
        subtitle={
          isLoading ? 'Loading…' : isError ? 'Error loading audit log' : `${meta?.total ?? 0} events`
        }
      />

      <ListToolbar
        searchValue={action}
        onSearchChange={(value) => {
          setAction(value);
          setPage(1);
        }}
        searchPlaceholder="Filter by action (e.g. platform.org)…"
      />

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {isLoading && <LoadingState label="Loading audit log…" />}
        {isError && !isLoading && (
          <ErrorState
            message={describeError(error, 'Failed to load audit log')}
            onRetry={() => refetch()}
          />
        )}
        {!isLoading && !isError && items.length === 0 && (
          <EmptyState title="No audit events" description="Platform actions will appear here." />
        )}
        {!isLoading && !isError && items.length > 0 && (
          <div className="overflow-x-auto">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden sm:table-cell">Actor</TableHead>
                  <TableHead className="hidden md:table-cell">Organization</TableHead>
                  <TableHead className="hidden lg:table-cell">Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.action}</TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {log.actor
                        ? `${log.actor.firstName} ${log.actor.lastName}`
                        : '—'}
                      {log.actor ? (
                        <p className="text-xs text-muted-foreground">{log.actor.email}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {log.organization ? (
                        <Link
                          to="/platform/organizations/$orgId"
                          params={{ orgId: log.organization.id }}
                          className="hover:text-brand"
                        >
                          {log.organization.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {log.entityType}
                      {log.entityId ? (
                        <span className="block font-mono text-xs">{log.entityId}</span>
                      ) : null}
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
