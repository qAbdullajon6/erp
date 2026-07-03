import Link from "next/link";
import { Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "#problems", label: "Problems" },
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#roles", label: "Roles" },
];

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
        <Link href="/landing" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="size-4.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">FlowERP AI</span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-6 text-sm text-muted-foreground md:flex">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/">View Operations Dashboard</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/">Explore Live Demo</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
