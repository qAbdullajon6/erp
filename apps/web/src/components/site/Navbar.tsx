import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { openDemoModal } from "@/components/site/DemoModal";
import { useEffect, useState } from "react";
import { analytics } from "@/lib/analytics";
import { trackNavClick } from "@/lib/analytics/track-nav";
import { Menu } from "lucide-react";
import { MobileMenu } from "@/components/site/MobileMenu";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleDemoClick = () => {
    analytics.track({ name: 'book_demo_click', params: { source: 'navbar' } });
    openDemoModal();
  };

  const handleMobileMenuOpen = () => {
    setMobileMenuOpen(true);
    analytics.track({ name: 'nav_click', params: { link_text: 'Mobile Menu', link_url: '#menu' } });
  };

  return (
    <>
      <header
        className={`sticky top-0 z-40 w-full transition-colors ${
          scrolled ? "border-b border-border/60 bg-background/80 backdrop-blur-xl" : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" aria-label="FlowERP AI Home">
            <Logo />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex" aria-label="Main navigation">
            <a
              href="#features"
              className="transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm"
              onClick={() => trackNavClick('Features', '#features')}
            >
              Features
            </a>
            <a
              href="#workflow"
              className="transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm"
              onClick={() => trackNavClick('How it works', '#workflow')}
            >
              How it works
            </a>
            <a
              href="#ai"
              className="transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm"
              onClick={() => trackNavClick('AI Assistant', '#ai')}
            >
              AI Assistant
            </a>
            <a
              href="#faq"
              className="transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm"
              onClick={() => trackNavClick('FAQ', '#faq')}
            >
              FAQ
            </a>
            <a
              href="#contact"
              className="transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm"
              onClick={() => trackNavClick('Contact', '#contact')}
            >
              Contact
            </a>
          </nav>

          <div className="flex items-center gap-2">
            {/* Sign In - Hidden on mobile, visible on sm+ */}
            <Link
              to="/auth/sign-in"
              className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm sm:inline-block"
              onClick={() => trackNavClick('Sign In', '/auth/sign-in')}
            >
              Sign In
            </Link>

            {/* Desktop CTA - Hidden on mobile */}
            <Button
              onClick={handleDemoClick}
              className="hidden h-9 bg-gradient-brand text-brand-foreground hover:opacity-90 sm:inline-flex"
            >
              Get a Demo
            </Button>

            {/* Mobile Menu Button - Visible only on mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 md:hidden"
              onClick={handleMobileMenuOpen}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Sheet */}
      <MobileMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
    </>
  );
}
