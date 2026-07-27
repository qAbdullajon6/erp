import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Same `cn()` contract as every shadcn-derived component library: merge conditional
 * class lists and let tailwind-merge resolve conflicting utility classes (e.g. two
 * different `px-*` values) by keeping the last one. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
