'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function PaginationBar({
  page,
  totalPages,
  total,
  onPageChange,
  prevTestId,
  nextTestId,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  prevTestId?: string;
  nextTestId?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-brand/10 bg-surface p-4">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages} ({total} total)
      </p>
      <div className="flex gap-2">
        <Button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          variant="outline"
          size="sm"
          data-testid={prevTestId}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          variant="outline"
          size="sm"
          data-testid={nextTestId}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
