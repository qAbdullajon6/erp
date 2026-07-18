/**
 * Mobile navigation menu (Sheet/Drawer component).
 *
 * Provides full navigation access on mobile devices where the desktop nav is hidden.
 * Slides in from the right, includes all navigation links, sign-in button, and primary CTA.
 */

import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { openDemoModal } from "@/components/site/DemoModal";
import { analytics } from "@/lib/analytics";
import { trackNavClick as baseTrackNavClick } from "@/lib/analytics/track-nav";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileMenu({ open, onOpenChange }: MobileMenuProps) {
  const trackNavClick = (linkText: string, linkUrl: string) => {
    baseTrackNavClick(linkText, linkUrl);
    onOpenChange(false); // Close menu after navigation
  };

  const handleDemoClick = () => {
    analytics.track({ name: 'book_demo_click', params: { source: 'mobile_menu' } });
    onOpenChange(false); // Close menu before opening modal
    // Small delay to ensure menu closes before modal opens (prevents visual jank)
    setTimeout(() => {
      openDemoModal();
    }, 100);
  };

  const handleSignInClick = () => {
    trackNavClick('Sign In (Mobile)', '/auth/sign-in');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-sm flex flex-col"
        id="mobile-menu"
        aria-labelledby="mobile-menu-title"
      >
        <SheetHeader className="text-left flex-none">
          <SheetTitle id="mobile-menu-title" className="flex items-center gap-2">
            <Logo showWordmark={false} size={24} />
            <span className="font-display text-lg font-semibold">Menu</span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Navigation menu for FlowERP AI
          </SheetDescription>
        </SheetHeader>

        <nav className="mt-8 flex flex-col gap-1 flex-1 overflow-y-auto pb-20" aria-label="Mobile navigation">
          {/* Main Navigation Links */}
          <a
            href="#features"
            className="flex h-11 items-center rounded-lg px-4 text-base font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            onClick={() => trackNavClick('Features (Mobile)', '#features')}
          >
            Features
          </a>
          <a
            href="#workflow"
            className="flex h-11 items-center rounded-lg px-4 text-base font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            onClick={() => trackNavClick('How it works (Mobile)', '#workflow')}
          >
            How it works
          </a>
          <a
            href="#ai"
            className="flex h-11 items-center rounded-lg px-4 text-base font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            onClick={() => trackNavClick('AI Assistant (Mobile)', '#ai')}
          >
            AI Assistant
          </a>
          <a
            href="#faq"
            className="flex h-11 items-center rounded-lg px-4 text-base font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            onClick={() => trackNavClick('FAQ (Mobile)', '#faq')}
          >
            FAQ
          </a>
          <a
            href="#contact"
            className="flex h-11 items-center rounded-lg px-4 text-base font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            onClick={() => trackNavClick('Contact (Mobile)', '#contact')}
          >
            Contact
          </a>

          {/* Divider */}
          <div className="my-4 border-t border-border" role="separator" aria-hidden="true" />

          {/* Sign In Link */}
          <Link
            to="/auth/sign-in"
            className="flex h-11 items-center rounded-lg px-4 text-base font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            onClick={handleSignInClick}
          >
            Sign In
          </Link>
        </nav>

        {/* Primary CTA - Fixed at bottom */}
        <div className="absolute bottom-6 left-6 right-6">
          <Button
            onClick={handleDemoClick}
            className="h-12 w-full bg-gradient-brand text-brand-foreground hover:opacity-90 focus:ring-2 focus:ring-ring focus:ring-offset-2"
            size="lg"
          >
            Get a Demo
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
