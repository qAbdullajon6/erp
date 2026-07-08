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
    <img
      src="/favicon.ico"
      alt="FlowERP AI"
      width={size}
      height={size}
      className={cn("shrink-0 rounded", className)}
    />
  );
}
