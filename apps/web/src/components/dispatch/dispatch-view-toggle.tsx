'use client';

import { useNavigate } from '@tanstack/react-router';
import { CalendarDays, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DispatchSurface = 'list' | 'board' | 'calendar';

interface DispatchViewToggleProps {
  current: DispatchSurface;
}

export function DispatchViewToggle({ current }: DispatchViewToggleProps) {
  const navigate = useNavigate();

  return (
    <div
      className="inline-flex rounded-md border border-border p-0.5"
      role="group"
      aria-label="Dispatch view"
    >
      <Button
        variant={current === 'list' ? 'secondary' : 'ghost'}
        size="sm"
        className={cn(
          'h-7 gap-1 px-2 text-xs',
          current !== 'list' && 'text-muted-foreground',
        )}
        aria-current={current === 'list' ? 'page' : undefined}
        onClick={() => {
          if (current !== 'list') void navigate({ to: '/app/dispatches' });
        }}
      >
        <List className="h-3.5 w-3.5" />
        List
      </Button>
      <Button
        variant={current === 'board' ? 'secondary' : 'ghost'}
        size="sm"
        className={cn(
          'h-7 gap-1 px-2 text-xs',
          current !== 'board' && 'text-muted-foreground',
        )}
        aria-current={current === 'board' ? 'page' : undefined}
        onClick={() => {
          if (current !== 'board') void navigate({ to: '/app/dispatches/board' });
        }}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Board
      </Button>
      <Button
        variant={current === 'calendar' ? 'secondary' : 'ghost'}
        size="sm"
        className={cn(
          'h-7 gap-1 px-2 text-xs',
          current !== 'calendar' && 'text-muted-foreground',
        )}
        aria-current={current === 'calendar' ? 'page' : undefined}
        data-testid="dispatch-calendar-nav"
        onClick={() => {
          if (current !== 'calendar') void navigate({ to: '/app/dispatches/calendar' });
        }}
      >
        <CalendarDays className="h-3.5 w-3.5" />
        Calendar
      </Button>
    </div>
  );
}
