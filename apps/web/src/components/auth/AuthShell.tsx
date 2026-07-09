import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { ArrowLeft, Check } from "lucide-react";

/// What a signed-in user gets. Kept short and factual — the same claims the
/// landing page's proof band makes.
const HIGHLIGHTS = [
  "Orders, dispatch, fleet, and finance in one place",
  "Role-scoped access for every person on your team",
  "Live delay alerts and receivables, never a stale export",
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-background lg:grid lg:grid-cols-2">
      {/* Brand panel — desktop only. Gives the form somewhere to sit instead of
          floating alone in the middle of a wide screen. */}
      <aside className="relative hidden overflow-hidden border-r border-border/60 bg-sidebar p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow" />

        <Link to="/" className="relative flex items-center gap-3">
          <LogoMark size={36} />
          <Wordmark />
        </Link>

        <div className="relative">
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-foreground">
            Run every delivery from one intelligent command center.
          </h2>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="mt-0.5 shrink-0 rounded-full bg-brand/10 p-1 text-brand">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          © {new Date().getFullYear()} FlowERP AI. All rights reserved.
        </p>
      </aside>

      <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow lg:hidden" />

        <div className="relative w-full max-w-md">
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to site
          </Link>

          <div className="flex justify-center lg:hidden">
            <LogoMark size={44} className="mb-6" />
          </div>

          <div className="rounded-2xl border border-border/60 bg-surface/80 p-8 shadow-elevated backdrop-blur">
            <div className="text-center lg:text-left">
              <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="mt-7">{children}</div>
          </div>

          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
