import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}

export function Logo({ className, size = 32, showWordmark = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {showWordmark && (
        <span className="font-display text-[17px] font-bold tracking-tight text-foreground">
          FlowERP<span className="text-brand"> AI</span>
        </span>
      )}
    </div>
  );
}

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      aria-label="FlowERP AI"
    >
      <defs>
        <linearGradient id="flowerp-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.68 0.17 250)" />
          <stop offset="1" stopColor="oklch(0.82 0.13 220)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="oklch(0.23 0.04 260)" />
      <rect width="64" height="64" rx="14" fill="url(#flowerp-mark)" fillOpacity="0.12" />
      <path
        d="M20 14h26v9H29v9h14v9H29v13h-9z"
        fill="url(#flowerp-mark)"
      />
    </svg>
  );
}
