'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { ApiDispatch } from '@/lib/api/dispatches';

/// 08:15 scenario: a call comes in about a specific dispatch. Finding it used
/// to mean scanning columns. This searches everything already on screen (the
/// board's own 200-row fetch, BOARD_PAGE_SIZE in dispatch-board.tsx — no
/// separate request) and opens the result directly in the Selected Dispatch
/// panel, so the board is never left.

function matches(dispatch: ApiDispatch, query: string): boolean {
  const q = query.toLowerCase();
  return (
    dispatch.dispatchNumber.toLowerCase().includes(q) ||
    (dispatch.order?.orderNumber.toLowerCase().includes(q) ?? false) ||
    (dispatch.order?.customer?.companyName.toLowerCase().includes(q) ?? false) ||
    (dispatch.driver && `${dispatch.driver.firstName} ${dispatch.driver.lastName}`.toLowerCase().includes(q)) ||
    (dispatch.vehicle?.plateNumber.toLowerCase().includes(q) ?? false)
  );
}

interface Props {
  dispatches: ApiDispatch[];
  onSelect: (dispatch: ApiDispatch) => void;
}

export function DispatchSearch({ dispatches, onSelect }: Props) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    return dispatches.filter((d) => matches(d, query)).slice(0, 8);
  }, [dispatches, query]);

  const select = (dispatch: ApiDispatch) => {
    onSelect(dispatch);
    setQuery('');
  };

  return (
    <div className="relative w-56 sm:w-72">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        id="dispatch-search-input"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setQuery('');
            e.currentTarget.blur();
          }
        }}
        placeholder="Search order, dispatch, customer..."
        className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-lg">
          {results.map((dispatch) => (
            <button
              key={dispatch.id}
              type="button"
              onClick={() => select(dispatch)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
            >
              <span className="font-mono font-medium text-foreground">{dispatch.dispatchNumber}</span>
              <span className="truncate text-xs text-muted-foreground">
                {dispatch.order?.customer?.companyName ?? dispatch.order?.orderNumber ?? ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
