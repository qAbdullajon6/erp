import Link from "next/link";
import { Boxes } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function LandingFooter() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">FlowERP AI</span>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Demo Product
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Built by IT Technology Group. © {new Date().getFullYear()} FlowERP AI.
        </p>

        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          Open the app
        </Link>
      </div>
    </footer>
  );
}
