import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { LiveDot } from "@/components/site/landing/primitives";
import { ArrowLeft, Gauge, PackageCheck, Truck } from "lucide-react";

/// The brand panel's operational snapshot. Static numbers, deliberately not
/// live data — this is a marketing-adjacent surface (a signed-out screen),
/// not a dashboard, so it shows the shape of the product rather than wiring
/// a real metrics query into an unauthenticated page.
const OPERATIONS_SNAPSHOT = [
  { icon: PackageCheck, label: "Orders in flight", value: "1,284" },
  { icon: Truck, label: "Fleet active", value: "86 / 92" },
  { icon: Gauge, label: "On-time rate", value: "97.4%" },
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
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-hero-glow" />
        <div
          aria-hidden
          className="lv2-grid-fine lv2-mask-radial pointer-events-none absolute inset-0 opacity-50"
        />

        <Link to="/" className="relative flex items-center gap-3">
          <LogoMark size={36} />
          <Wordmark />
        </Link>

        <div className="relative">
          <h2 className="max-w-sm font-display text-[2rem] font-semibold leading-[1.15] tracking-tight text-foreground">
            Run every delivery from one intelligent command center.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Orders, dispatch, fleet, and finance in one place — with an AI copilot that
            watches your operation and flags what needs attention.
          </p>

          <div className="mt-10 overflow-hidden rounded-2xl border border-border/60 bg-background/40 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Live operations
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-success">
                <LiveDot />
                All systems operational
              </span>
            </div>
            <dl className="divide-y divide-border/60">
              {OPERATIONS_SNAPSHOT.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center justify-between px-4 py-3">
                  <dt className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
                    {label}
                  </dt>
                  <dd className="font-display text-sm font-semibold tabular-nums text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <p className="relative text-xs text-muted-foreground">
          © {new Date().getFullYear()} FlowERP AI. All rights reserved.
        </p>
      </aside>

      <main id="main-content" className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-hero-glow lg:hidden" />

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

          <div className="auth-rise rounded-2xl border border-border/60 bg-surface/80 p-6 shadow-elevated backdrop-blur-sm sm:p-8">
            <div className="text-center lg:text-left">
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
              {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="mt-8">{children}</div>
          </div>

          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
