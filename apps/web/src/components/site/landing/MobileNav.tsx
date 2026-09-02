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
import { NAV_LINKS } from "./nav-links";

export function MobileNav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const go = (label: string, href: string) => {
    baseTrackNavClick(label, href);
    onOpenChange(false);
  };

  const handleDemo = () => {
    analytics.track({ name: "book_demo_click", params: { source: "mobile_menu" } });
    onOpenChange(false);
    // Opening the demo dialog immediately would stack it on top of the sheet's
    // own close transition (ui/sheet.tsx: 300ms close duration) — 120ms lets
    // the sheet visibly start closing first so the two don't visually collide.
    setTimeout(() => openDemoModal("mobile_menu"), 120);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        id="mobile-menu"
        aria-labelledby="mobile-menu-title"
        className="flex w-full flex-col bg-background sm:max-w-sm"
      >
        <SheetHeader className="flex-none text-left">
          <SheetTitle id="mobile-menu-title" className="flex items-center">
            <Logo />
          </SheetTitle>
          <SheetDescription className="sr-only">FlowERP navigation</SheetDescription>
        </SheetHeader>

        {/* Everything sits together at the top rather than pinning the CTA to
            the bottom of the sheet. Pinned, it landed underneath the cookie
            banner on a first visit — so the one action we most want a new
            visitor to take was invisible — with a large empty gap above it. */}
        <nav className="mt-6 flex flex-col gap-1" aria-label="Mobile">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => go(link.label, link.href)}
              className="flex h-12 items-center rounded-lg px-4 text-base font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
            </a>
          ))}

          <div className="my-3 h-px bg-border" role="separator" aria-hidden />

          <Link
            to="/login"
            onClick={() => go("Sign in (mobile)", "/login")}
            className="flex h-12 items-center rounded-lg px-4 text-base font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sign in
          </Link>

          <Button
            onClick={handleDemo}
            size="lg"
            className="mt-3 h-12 w-full bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
          >
            Get started
          </Button>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
