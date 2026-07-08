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
      {showWordmark && (
        <span className="font-display text-[17px] font-light tracking-tight text-foreground">
          FlowERP<span className="text-brand"> AI</span>
        </span>
      )}
    </div>
  );
}

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      aria-label="FlowERP AI"
    >
      {/* Background */}
      <rect width="64" height="64" rx="14" fill="#4F46E5" />

      {/* F mark in white */}
      <path
        d="M20 14h26v9H29v9h14v9H29v13h-9z"
        fill="#ffffff"
      />
    </svg>
  );
}
