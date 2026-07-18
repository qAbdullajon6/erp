/**
 * Sticky mobile CTA button.
 *
 * Appears at the bottom of the screen on mobile devices after scrolling past the hero.
 * Provides persistent access to the primary conversion action (demo request).
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";
import { analytics } from "@/lib/analytics";

export function MobileCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const threshold = window.innerHeight * 0.5;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrolled = window.scrollY > threshold;
          setVisible((prev) => {
            // Only update state if visibility actually changed
            if (prev !== scrolled) {
              return scrolled;
            }
            return prev;
          });
          ticking = false;
        });
        ticking = true;
      }
    };

    // Check initial scroll position
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleClick = () => {
    analytics.track({ name: 'book_demo_click', params: { source: 'mobile_sticky_cta' } });
    openDemoModal();
  };

  // Don't render on desktop (md:hidden)
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-30 transition-transform duration-300 md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      aria-hidden={!visible}
    >
      {/* Backdrop with gradient fade */}
      <div className="pointer-events-none absolute inset-0 -top-8 bg-gradient-to-t from-background via-background/95 to-transparent" />

      {/* CTA Button Container */}
      <div className="relative border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-xl">
        <Button
          onClick={handleClick}
          className="h-12 w-full bg-gradient-brand text-brand-foreground shadow-lg hover:opacity-90 focus:ring-2 focus:ring-ring focus:ring-offset-2"
          size="lg"
        >
          Get a Demo
        </Button>
      </div>
    </div>
  );
}
