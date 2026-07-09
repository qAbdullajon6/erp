'use client';

import type { ReactNode } from 'react';

/// One label/value pair inside a detail card. Values fall back to an em dash
/// so empty fields still occupy their grid cell and the layout stays aligned.
export function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className={`mt-0.5 text-foreground ${mono ? 'font-mono text-sm' : ''}`}>
        {isEmpty ? <span className="text-muted-foreground">—</span> : value}
      </div>
    </div>
  );
}
