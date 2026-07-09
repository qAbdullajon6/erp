import { Link } from "@tanstack/react-router";
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
      className={`sticky top-0 z-40 w-full transition-colors ${
        scrolled ? "border-b border-border/60 bg-background/80 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">Features</a>
          <a href="#workflow" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#ai" className="transition-colors hover:text-foreground">AI Assistant</a>
          <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          <a href="#contact" className="transition-colors hover:text-foreground">Contact</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/auth/sign-in" className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-block">
            Sign In
          </Link>
          <Button onClick={openDemoModal} className="h-9 bg-gradient-brand text-brand-foreground hover:opacity-90">
            Request a Personalized Demo
          </Button>
        </div>
      </div>
    </header>
  );
}
