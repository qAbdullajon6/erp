import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/** Sticky demo CTA that appears on mobile after the hero scrolls away. */
export function MobileCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const threshold = () => window.innerHeight * 0.7;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setVisible(window.scrollY > threshold());
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = () => {
    analytics.track({ name: "book_demo_click", params: { source: "mobile_sticky_cta" } });
    openDemoModal("mobile_sticky_cta");
  };

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 md:hidden",
        visible ? "translate-y-0" : "translate-y-full",
      )}
      aria-hidden={!visible}
    >
      <div className="border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
        <Button
          onClick={handleClick}
          size="lg"
          className="h-12 w-full bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
          tabIndex={visible ? 0 : -1}
        >
          Request a personalized demo
        </Button>
      </div>
    </div>
  );
}
