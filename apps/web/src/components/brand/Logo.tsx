import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}

export function Logo({ className, size = 28, showWordmark = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {showWordmark && <Wordmark />}
    </div>
  );
}

/// "FlowERP" in the foreground colour, "AI" picked out in the brand gradient.
/// The two words used to be `font-light` foreground + a flat `text-brand` blue,
/// which read as two unrelated colours rather than one mark.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-[17px] font-semibold tracking-tight text-foreground", className)}>
      FlowERP<span className="text-gradient-brand"> AI</span>
    </span>
  );
}

/// The mark's tile used to be a hardcoded `#4F46E5` indigo that matched nothing
/// else on screen — the app's brand ramp is a lighter blue. It now paints with
/// the same gradient as `--gradient-brand`.
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="FlowERP AI"
    >
      <defs>
        <linearGradient id="flowerp-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.68 0.17 250)" />
          <stop offset="100%" stopColor="oklch(0.78 0.14 220)" />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="16" fill="url(#flowerp-mark)" />

      {/* F mark, knocked out against the tile. */}
      <path d="M20 14h26v9H29v9h14v9H29v13h-9z" fill="oklch(0.15 0.03 260)" />
    </svg>
  );
}
