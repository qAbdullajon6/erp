import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogoMark } from "@/components/brand/Logo";

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center">
          <LogoMark size={44} />
        </Link>
        <div className="rounded-2xl border border-border/60 bg-surface/80 p-8 shadow-elevated backdrop-blur">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="mt-7">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}
