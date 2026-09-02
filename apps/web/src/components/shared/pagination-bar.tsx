'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function PaginationBar({
  page,
  totalPages,
  total,
  onPageChange,
  limit,
  onLimitChange,
  prevTestId,
  nextTestId,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  limit?: number;
  onLimitChange?: (limit: number) => void;
  prevTestId?: string;
  nextTestId?: string;
}) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);

  if (safeTotalPages <= 1 && !onLimitChange) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/10 bg-surface p-4">
      <p className="text-sm text-muted-foreground">
        Page {safePage} of {safeTotalPages} ({total} total)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onLimitChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows</span>
            <Select
              value={String(limit ?? 25)}
              onValueChange={(v) => onLimitChange(Number(v))}
            >
              <SelectTrigger className="h-8 w-[72px] text-xs" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {safeTotalPages > 1 && (
          <>
            <Button
              onClick={() => onPageChange(safePage - 1)}
              disabled={safePage <= 1}
              variant="outline"
              size="sm"
              data-testid={prevTestId}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => onPageChange(safePage + 1)}
              disabled={safePage >= safeTotalPages}
              variant="outline"
              size="sm"
              data-testid={nextTestId}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
