import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { availabilityKeys, dispatchKeys, driverDispatchKeys, orderKeys } from './query-keys';

/// The ONE invalidation helper. Every operational mutation goes through it.
///
/// ## Why one helper and not a per-mutation list
///
/// Under ADR-001 there is only ONE operational fact — the Dispatch — and Order and
/// availability are both *views* of it. Assigning, reassigning, cancelling and
/// moving a dispatch all change that same fact, so they all invalidate the same
/// three roots. There is no mutation that moves a dispatch without changing the
/// order it projects onto, and none that changes either without changing who is
/// free. Writing four near-identical invalidation lists would just be four chances
/// to forget one — and the one people forget is always `availability`, which is how
/// a dispatcher ends up staring at a stale list of drivers.
///
/// So: state the rule once, in the place the rule lives.
///
///   dispatch changed  ->  dispatches.*  +  orders.*  +  availability.*
///
/// Drivers and vehicles are deliberately NOT invalidated. Assigning somebody does
/// not change their employment status or their number plate — only whether they are
/// busy, and that is `availability`, which we do invalidate. Invalidating them too
/// would refetch two lists that cannot have changed.
export function invalidateOperationalState(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    // Every order list and every order detail: the projection has moved (R3).
    queryClient.invalidateQueries({ queryKey: orderKeys.all }),
    // The dispatch itself.
    queryClient.invalidateQueries({ queryKey: dispatchKeys.all }),
    // Who is free changed — for every window, not just the one on screen: a trip
    // in June affects the June window and no other, but we cannot know from here
    // which cached windows overlap it, and being wrong here means showing a
    // dispatcher a driver the API will refuse.
    queryClient.invalidateQueries({ queryKey: availabilityKeys.all }),
    // The DRIVER's view of the very same dispatch (Task 8.12). A dispatcher
    // reassigning a job and a driver marking it delivered are the same fact seen
    // from two ends, and each must move the other's screen. Cheap: these queries
    // only exist while a driver is looking at them.
    queryClient.invalidateQueries({ queryKey: driverDispatchKeys.all }),
  ]).then(() => undefined);
}

/// Hook form, for use inside mutations.
export function useInvalidateOperationalState(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => invalidateOperationalState(queryClient);
}
