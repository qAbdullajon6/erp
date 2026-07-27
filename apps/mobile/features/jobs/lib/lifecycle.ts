import type { DispatchStatus } from '@/services/api/endpoints/driver';
import { statusLabel } from '@/components/ui/status-badge';

/** The one legal order a dispatch moves through (R13's transition table, mirrored
 * client-side only for display — the server is the only thing that ever decides
 * whether a specific transition is allowed). DRAFT and CANCELLED aren't steps in
 * this line: a driver's dispatch list never contains DRAFT (see driverAPI.listMine
 * / the server-side query), and CANCELLED exits the line entirely rather than
 * occupying a position on it. */
export const DISPATCH_LIFECYCLE: DispatchStatus[] = [
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
  'DELIVERED',
];

export const DISPATCH_LIFECYCLE_LABELS = DISPATCH_LIFECYCLE.map(statusLabel);

export function lifecycleIndex(status: DispatchStatus): number {
  return DISPATCH_LIFECYCLE.indexOf(status);
}
