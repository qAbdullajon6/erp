import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";
import { analytics } from "@/lib/analytics";
import { trackNavClick } from "@/lib/analytics/track-nav";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "./nav-links";
import { MobileNav } from "./MobileNav";
import { ThemeToggle } from "./ThemeToggle";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleGetStarted = () => {
    analytics.track({ name: "book_demo_click", params: { source: "navbar" } });
    openDemoModal("navbar");
  };

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          scrolled
            ? "border-b border-border/50 bg-background/85 backdrop-blur-xl shadow-sm"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
          <Link
            to="/"
            aria-label="FlowERP — home"
            className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Logo />
          </Link>

          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => trackNavClick(link.label, link.href)}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Link
              to="/login"
              onClick={() => trackNavClick("Sign in", "/login")}
              className="hidden rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
            >
              Sign in
            </Link>
            <Button
              onClick={handleGetStarted}
              className="hidden h-9 bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90 sm:inline-flex"
            >
              Get started
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 md:hidden"
              onClick={() => {
                setMobileOpen(true);
                analytics.track({
                  name: "nav_click",
                  params: { link_text: "Open menu", link_url: "#menu" },
                });
              }}
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />
    </>
  );
}
