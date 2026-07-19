/**
 * Landing V2 — design-system primitives.
 *
 * Every section is built from these so the page is consistent by construction:
 * one section rhythm, one container width, one eyebrow, one heading scale, one
 * card. Sections never re-invent spacing or typography — they compose this.
 *
 * See design-system.md for the rules these encode.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion";

/* ------------------------------------------------------------------ layout */

/**
 * The single source of vertical rhythm + container width.
 * `backdrop` adds one restrained ambient treatment (a top brand wash or a
 * faded engineering grid); default is none.
 */
export function Section({
  id,
  className,
  children,
  bordered = true,
  width = "default",
  backdrop = "none",
  sectionRef,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
  bordered?: boolean;
  width?: "default" | "wide" | "narrow";
  backdrop?: "none" | "wash" | "grid";
  sectionRef?: React.Ref<HTMLElement>;
}) {
  return (
    <section
      id={id}
      ref={sectionRef}
      className={cn(
        "relative isolate py-24 sm:py-32",
        bordered && "border-t border-border/60",
        className,
      )}
    >
      {backdrop === "wash" && (
        <div aria-hidden className="lv2-wash pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]" />
      )}
      {backdrop === "grid" && (
        <div
          aria-hidden
          className="lv2-grid lv2-mask-radial pointer-events-none absolute inset-0 -z-10 opacity-70"
        />
      )}
      <Container width={width}>{children}</Container>
    </section>
  );
}

export function Container({
  children,
  width = "default",
  className,
}: {
  children: React.ReactNode;
  width?: "default" | "wide" | "narrow";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto px-6",
        width === "wide" && "max-w-7xl",
        width === "default" && "max-w-6xl",
        width === "narrow" && "max-w-3xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- typography */

/** The one label above a section title. Optional leading tick. */
export function Eyebrow({
  children,
  className,
  tick = true,
}: {
  children: React.ReactNode;
  className?: string;
  tick?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand",
        className,
      )}
    >
      {tick && <span aria-hidden className="h-1 w-1 rounded-full bg-brand" />}
      {children}
    </span>
  );
}

/**
 * Section header: eyebrow + title + optional lead. Centered by default, and
 * revealed on scroll as one staggered unit.
 */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl",
        className,
      )}
    >
      {eyebrow && (
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
        </Reveal>
      )}
      <Reveal delay={60} as="h2" className="mt-4 text-balance font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
        {title}
      </Reveal>
      {lead && (
        <Reveal delay={120}>
          <p
            className={cn(
              "mt-5 text-lg leading-relaxed text-muted-foreground",
              align === "center" && "mx-auto max-w-2xl",
            )}
          >
            {lead}
          </p>
        </Reveal>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- atoms */

/** Surface card. `interactive` adds the one hover treatment (border + lift). */
export const Card = React.forwardRef<
  HTMLElement,
  {
    children: React.ReactNode;
    className?: string;
    interactive?: boolean;
    as?: React.ElementType;
  } & React.HTMLAttributes<HTMLElement>
>(function Card({ children, className, interactive = false, as: Tag = "div", ...rest }, ref) {
  return (
    <Tag
      ref={ref}
      className={cn(
        "rounded-xl border border-border bg-surface",
        interactive && "transition duration-200 hover:-translate-y-0.5 hover:border-brand/40",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
});

/** Square-ish accent tile for a Lucide icon. */
export function IconTile({
  children,
  className,
  size = "md",
}: {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-brand/10 text-brand ring-1 ring-inset ring-brand/15",
        size === "md" ? "h-11 w-11" : "h-9 w-9",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A small labelled pill (feature tag, status). */
export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "brand" | "success";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        tone === "muted" && "border-border bg-surface text-muted-foreground",
        tone === "brand" && "border-brand/25 bg-brand/10 text-brand",
        tone === "success" && "border-success/25 bg-success/10 text-success",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Pulsing status dot with an outward ring. */
export function LiveDot({
  tone = "success",
  className,
}: {
  tone?: "success" | "brand";
  className?: string;
}) {
  const color = tone === "success" ? "bg-success" : "bg-brand";
  return (
    <span className={cn("relative flex h-2 w-2", className)}>
      <span className={cn("lv2-pulse-ring absolute inset-0 rounded-full", color)} />
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}

/** A macOS-style window frame for product visuals. */
export function BrowserFrame({
  url = "app.flowerp.ai",
  live = true,
  children,
  className,
}: {
  url?: string;
  live?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-border/70 bg-background/40 px-4 py-3">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-3 w-3 rounded-full bg-white/10" />
          <span className="h-3 w-3 rounded-full bg-white/10" />
          <span className="h-3 w-3 rounded-full bg-white/10" />
        </div>
        <div className="mx-auto flex items-center gap-2 rounded-md bg-background/60 px-3 py-1 text-xs text-muted-foreground">
          {url}
        </div>
        {live && (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-success">
            <LiveDot />
            Live
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** A single hairline divider that fades at both ends. */
export function FadeDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("h-px w-full bg-gradient-to-r from-transparent via-border to-transparent", className)}
    />
  );
}
