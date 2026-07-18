'use client';

import { useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { ListToolbar, FilterSelect } from '@/components/shared/list-toolbar';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { useImportHistory, useImportEntities } from '@/hooks/use-imports';
import { Upload } from 'lucide-react';

export function ImportHistory() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [entityFilter, setEntityFilter] = useState('');
  const [localSearch, setLocalSearch] = useState('');

  const { data: entitiesData } = useImportEntities();
  const entities = entitiesData?.items ?? [];

  const { data, meta, loading, error, refetch } = useImportHistory({
    page,
    limit: 20,
    entityType: entityFilter || undefined,
  });

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import History"
        subtitle={loading ? 'Loading...' : `${meta.total} import(s) found`}
        action={
          <Button
            onClick={() => navigate({ to: '/app/import' })}
            className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            <Upload className="h-4 w-4" />
            New Import
          </Button>
        }
      />

      <ListToolbar
        searchValue={localSearch}
        onSearchChange={setLocalSearch}
        searchPlaceholder="Search by file name..."
      >
        <FilterSelect
          label="Entity"
          value={entityFilter}
          onChange={(v) => { setEntityFilter(v); setPage(1); }}
        >
          <option value="">All Entities</option>
          {entities.map((e) => (
            <option key={e.entityType} value={e.entityType}>{e.label}</option>
          ))}
        </FilterSelect>
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {loading && <LoadingState label="Loading imports..." />}
        {error && !loading && (
          <ErrorState message={error instanceof Error ? error.message : 'Failed to load imports'} onRetry={() => refetch()} />
        )}
        {!loading && !error && data.length === 0 && (
          <EmptyState
            title="No imports found"
            description="Start by uploading a CSV or Excel file."
            action={
              <Button onClick={() => navigate({ to: '/app/import' })} className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90">
                <Upload className="h-4 w-4" />
                New Import
              </Button>
            }
          />
        )}
        {!loading && !error && data.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/50 hover:bg-surface/50">
                  <TableHead>File</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Processed</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-foreground">{item.fileName}</TableCell>
                    <TableCell>{item.entityType}</TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{item.totalRows}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{item.processedRows}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => navigate({ to: `/app/import/${item.id}` })}
                        variant="ghost"
                        size="sm"
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
      />
    </div>
  );
}
