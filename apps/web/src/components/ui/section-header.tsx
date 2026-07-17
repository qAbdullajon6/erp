import type { ReactNode } from "react";

/// The title+subtitle text pair every dashboard widget's header hand-rolled
/// identically (`text-lg font-semibold` + `text-sm text-muted-foreground`).
/// Distinct from shared/page-header.tsx's PageHeader, which is a whole-page
/// header (h1 scale) — this is the smaller, in-card version.
export function SectionHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
