import * as React from "react";

/// The width below which the sidebar becomes a drawer instead of a fixed rail.
///
/// This is Tailwind's `lg`, not `md`. At 768px the rail costs 16rem of a 48rem
/// viewport, leaving about 33rem for a screen whose whole job is a wide table —
/// so a dispatcher on a tablet in landscape read Orders through a third of the
/// window while the other two thirds showed navigation they were not using. The
/// drawer gives that width back, and the nav is one tap away.
///
/// MUST stay in step with the `lg:` breakpoints in components/ui/sidebar.tsx:
/// this hook decides which element renders, the media queries decide which is
/// visible, and if the two disagree there is a window where the sidebar renders
/// twice or not at all.
const MOBILE_BREAKPOINT = 1024;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
