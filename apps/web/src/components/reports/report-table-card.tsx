import type { ReactNode } from 'react';
import { SurfaceCard, SurfaceCardHeader } from '@/components/ui/surface-card';
import { SectionHeader } from '@/components/ui/section-header';

/// Every report section is the same three things: a titled surface, a sentence for
/// when the period has no rows, and a table. Each tab had been spelling that out
/// by hand — which is why the empty sentences were the only part that stayed
/// consistent and the card chrome and heading scale drifted from the dashboard's.
export function ReportTableCard({
  title,
  subtitle,
  action,
  isEmpty,
  emptyLabel,
  className,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  isEmpty: boolean;
  emptyLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <SurfaceCard className={className}>
      <SurfaceCardHeader>
        <SectionHeader title={title} subtitle={subtitle} />
        {action}
      </SurfaceCardHeader>
      {isEmpty ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        children
      )}
    </SurfaceCard>
  );
}

/// Telematics sections cut their list off rather than paginate. Saying so is the
/// difference between "our fleet has 15 vehicles" and "this is the first 15 of
/// 60" — a truncated table cannot tell the reader which one they are looking at.
export const TOP_ROWS = 15;

export function topOfLabel(total: number, noun: string) {
  if (total <= TOP_ROWS) {
    return `${total} ${noun}${total === 1 ? '' : 's'}`;
  }
  return `Showing ${TOP_ROWS} of ${total} ${noun}s`;
}
