'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

/// A sortable column header. `field` is generic so each module keeps its own
/// union of sortable field names rather than widening to `string`.
export function SortHeader<TField extends string>({
  field,
  label,
  activeField,
  order,
  onSort,
}: {
  field: TField;
  label: string;
  activeField: TField;
  order: 'asc' | 'desc';
  onSort: (field: TField) => void;
}) {
  const isActive = activeField === field;
  const Icon = !isActive ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1.5 font-semibold text-foreground transition-colors hover:text-brand"
      aria-label={`Sort by ${label}`}
    >
      {label}
      <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-brand' : 'text-muted-foreground/50'}`} />
    </button>
  );
}
