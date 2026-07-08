import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { openDemoModal } from "@/components/site/DemoModal";
import { useEffect, useState } from "react";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-200 ${
        scrolled
          ? "border-b border-border/40 bg-background/60 backdrop-blur-sm"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo - no duplicate text */}
        <Link href="/">
          <Logo />
        </Link>

        {/* Navigation */}
        <nav className="hidden items-center gap-8 text-sm md:flex">
          <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">Features</a>
          <a href="#workflow" className="text-muted-foreground transition-colors hover:text-foreground">How it works</a>
          <a href="#ai" className="text-muted-foreground transition-colors hover:text-foreground">AI Assistant</a>
          <a href="#contact" className="text-muted-foreground transition-colors hover:text-foreground">Contact</a>
        </nav>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <Link href="/auth/login" className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-block">
            Sign In
          </Link>
          <Button onClick={openDemoModal} className="h-9 px-6 bg-gradient-brand text-brand-foreground font-medium hover:opacity-95 transition-all duration-200">
            Request a Personalized Demo
          </Button>
        </div>
      </div>
    </header>
  );
}
