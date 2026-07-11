import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';

/// The board's columns — presentation only.
///
/// This file contains NO business rule. It says what the seven columns are called
/// and in which order they read left-to-right; it does not decide what a dispatch
/// may do. Which moves are legal comes from the server, on every dispatch, as
/// `allowedTransitions` (Task 8.10). If you find yourself wanting to add a
/// `canMoveTo()` here, stop: that rule already exists, once, in the API.

export interface BoardColumn {
  status: DispatchStatus;
  title: string;
  /// Terminal columns are visually quieter — nothing leaves them, and a card that
  /// lands there is finished.
  terminal: boolean;
}

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { status: 'DRAFT', title: 'Draft', terminal: false },
  { status: 'ASSIGNED', title: 'Assigned', terminal: false },
  { status: 'EN_ROUTE_TO_PICKUP', title: 'En Route to Pickup', terminal: false },
  { status: 'AT_PICKUP', title: 'At Pickup', terminal: false },
  { status: 'IN_TRANSIT', title: 'In Transit', terminal: false },
  { status: 'DELIVERED', title: 'Delivered', terminal: true },
  { status: 'CANCELLED', title: 'Cancelled', terminal: true },
] as const;

/// Buckets the dispatches by the status the API gave them.
///
/// This is a read of an API field, not a derivation: no dispatch is placed in a
/// column by anything other than its own `status`. Every column exists even when
/// empty, so the board does not reflow as cards move.
export function groupByStatus(dispatches: ApiDispatch[]): Record<DispatchStatus, ApiDispatch[]> {
  const columns = Object.fromEntries(
    BOARD_COLUMNS.map((column) => [column.status, [] as ApiDispatch[]]),
  ) as Record<DispatchStatus, ApiDispatch[]>;

  for (const dispatch of dispatches) {
    // A status the board does not know about would otherwise vanish silently.
    // Better to notice than to lose a dispatch off the board.
    if (columns[dispatch.status]) {
      columns[dispatch.status].push(dispatch);
    }
  }
  return columns;
}

/// May this dispatch be dropped into this column?
///
/// The answer is the SERVER'S, verbatim. `allowedTransitions` arrives with the
/// dispatch and this function does nothing but look inside it — it does not know
/// the transition graph and must never learn it.
export function canDropInto(dispatch: ApiDispatch, target: DispatchStatus): boolean {
  if (dispatch.status === target) return false;
  return dispatch.allowedTransitions.includes(target);
}

/// Cancellation has its own endpoint (POST /:id/cancel), so a drop onto the
/// Cancelled column is routed there rather than to the status endpoint — but the
/// question "is it allowed?" is still the server's answer, not ours.
export function isCancelDrop(target: DispatchStatus): boolean {
  return target === 'CANCELLED';
}
