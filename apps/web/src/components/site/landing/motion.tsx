/**
 * Landing V2 — motion layer.
 *
 * A tiny, dependency-free set of motion primitives so every section shares one
 * animation language: a single reveal easing, one entrance (fade + rise),
 * count-ups, and a typewriter. Every primitive is SSR-safe and collapses to a
 * static state under `prefers-reduced-motion`.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/** One easing for the whole page: an assertive ease-out (expo-ish). */
export const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Read the OS "reduce motion" setting (false on the server, live on client). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

/**
 * Fire once when an element scrolls into view.
 * `rootMargin` defaults to a small negative bottom so reveals trigger a beat
 * before the element is fully on screen.
 */
export function useInView<T extends Element = HTMLDivElement>(options?: {
  once?: boolean;
  amount?: number;
  rootMargin?: string;
}): [React.RefObject<T | null>, boolean] {
  const { once = true, amount = 0.2, rootMargin = "0px 0px -10% 0px" } = options ?? {};
  const ref = React.useRef<T>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold: amount, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [once, amount, rootMargin]);

  return [ref, inView];
}

/**
 * The page's single entrance animation: fade + subtle rise on scroll-in.
 * `delay` (ms) staggers siblings. Renders statically under reduced motion.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  y = 16,
  className,
  once = true,
}: {
  children: React.ReactNode;
  as?: React.ElementType;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>({ once });
  const shown = reduced || inView;

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : `translateY(${y}px)`,
        transition: reduced
          ? undefined
          : `opacity 0.7s ${EASE} ${delay}ms, transform 0.7s ${EASE} ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * Count a number up to `value` once in view. Handles decimals, thousands
 * separators, and an optional prefix/suffix. Jumps straight to the value under
 * reduced motion.
 */
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1500,
  separator = true,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  separator?: boolean;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLSpanElement>({ once: true });
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, value, duration]);

  const formatted = React.useMemo(() => {
    const fixed = display.toFixed(decimals);
    if (!separator) return fixed;
    const [intPart, decPart] = fixed.split(".");
    const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return decPart ? `${withSep}.${decPart}` : withSep;
  }, [display, decimals, separator]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

/**
 * Reveal a string character-by-character once `enabled`. Returns the visible
 * slice and whether it finished. Under reduced motion it appears complete.
 */
export function useTypewriter(
  text: string,
  { speed = 26, enabled = true, startDelay = 0 }: { speed?: number; enabled?: boolean; startDelay?: number } = {},
): { text: string; done: boolean } {
  const reduced = usePrefersReducedMotion();
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    setCount(0);
    if (!enabled) return;
    if (reduced) {
      setCount(text.length);
      return;
    }
    let raf = 0;
    let startedAt = 0;
    const step = (now: number) => {
      if (!startedAt) startedAt = now + startDelay;
      const elapsed = now - startedAt;
      if (elapsed >= 0) {
        const next = Math.min(text.length, Math.floor(elapsed / speed));
        setCount(next);
        if (next >= text.length) return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, speed, enabled, startDelay, reduced]);

  return { text: text.slice(0, count), done: count >= text.length };
}

/**
 * Subtle pointer parallax for a hero element. Returns a ref to attach to the
 * *container* whose pointer movement drives the tilt, plus a style to spread
 * onto the moving layer. No-op under reduced motion or on coarse pointers.
 */
export function usePointerParallax(strength = 10) {
  const reduced = usePrefersReducedMotion();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || reduced) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setOffset({ x: px * strength, y: py * strength }),
      );
    };
    const onLeave = () => setOffset({ x: 0, y: 0 });

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced, strength]);

  return {
    containerRef,
    style: {
      transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
      transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
    } as React.CSSProperties,
  };
}
