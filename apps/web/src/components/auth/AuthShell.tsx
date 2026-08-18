import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Package, Truck, Wallet, Sparkles, CheckCircle2 } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/brand/Logo";

const FEATURES = [
  { icon: Package, text: "Orders & dispatch in one view" },
  { icon: Truck, text: "Live GPS fleet tracking" },
  { icon: Wallet, text: "Invoicing from delivered orders" },
  { icon: Sparkles, text: "AI assistant across every screen" },
];

/** Left panel — dark branded side shown on desktop. */
function AuthPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-white p-12 dark:bg-[oklch(0.09_0.008_260)] lg:flex">
      {/* Grid background – light */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dark:hidden"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0 0 0 / 0.04) 1px, transparent 1px), linear-gradient(to bottom, oklch(0 0 0 / 0.04) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
        }}
      />
      {/* Grid background – dark */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(1 0 0 / 0.025) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 0.025) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
        }}
      />
      {/* Orange top glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-96"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, oklch(0.72 0.20 48 / 0.12), transparent 70%)",
        }}
      />
      {/* Corner glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.72 0.20 48 / 0.06), transparent 70%)",
        }}
      />

      {/* Top: Logo */}
      <div className="relative z-10">
        <Link to="/" aria-label="FlowERP — home" className="inline-flex items-center gap-2.5">
          <LogoMark size={32} />
          <Wordmark className="text-foreground" />
        </Link>
      </div>

      {/* Middle: Illustration + headline */}
      <div className="relative z-10 flex flex-col gap-8">
        {/* Logistics SVG illustration */}
        <div className="flex justify-center">
          <LogisticsIllustration />
        </div>

        <div>
          <h2 className="font-display text-2xl font-bold leading-snug tracking-tight text-foreground">
            Your entire logistics operation
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #FB923C, #F97316)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              in one place.
            </span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Orders, dispatch, fleet and finance — connected and live.
          </p>
        </div>

        {/* Feature list */}
        <ul className="space-y-3">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: "oklch(0.72 0.20 48 / 0.15)" }}
              >
                <f.icon className="h-4 w-4" style={{ color: "oklch(0.80 0.18 50)" }} />
              </div>
              <span className="text-sm text-muted-foreground">{f.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom: Trust badge */}
      <div className="relative z-10">
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium border border-border bg-muted text-muted-foreground"
        >
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "oklch(0.66 0.18 145)" }} />
          14-day free trial · No credit card required
        </div>
      </div>
    </div>
  );
}

/** Minimal SVG logistics illustration for the auth panel. */
function LogisticsIllustration() {
  return (
    <svg
      width="280"
      height="200"
      viewBox="0 0 280 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Route lines */}
      <path
        d="M30 160 Q80 80 140 100 Q200 120 250 60"
        stroke="oklch(0.72 0.20 48 / 0.25)"
        strokeWidth="2"
        strokeDasharray="6 4"
        fill="none"
      />
      <path
        d="M30 100 Q100 140 160 80 Q200 50 260 120"
        stroke="oklch(0.60 0.16 145 / 0.20)"
        strokeWidth="1.5"
        strokeDasharray="4 6"
        fill="none"
      />

      {/* City nodes */}
      {[
        { cx: 30, cy: 160 },
        { cx: 140, cy: 100 },
        { cx: 250, cy: 60 },
        { cx: 30, cy: 100 },
        { cx: 160, cy: 80 },
        { cx: 260, cy: 120 },
      ].map((node, i) => (
        <g key={i}>
          <circle cx={node.cx} cy={node.cy} r="6" fill="oklch(0.14 0.008 260)" stroke="oklch(0.72 0.20 48 / 0.40)" strokeWidth="1.5" />
          <circle cx={node.cx} cy={node.cy} r="2.5" fill="oklch(0.72 0.20 48)" />
        </g>
      ))}

      {/* Animated truck 1 — on main route */}
      <g transform="translate(95, 93)">
        <rect x="-18" y="-10" width="36" height="20" rx="4" fill="oklch(0.72 0.20 48)" opacity="0.95" />
        <rect x="-14" y="-7" width="14" height="14" rx="2" fill="white" fillOpacity="0.20" />
        <circle cx="-10" cy="10" r="4" fill="oklch(0.14 0.008 260)" stroke="white" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="4" fill="oklch(0.14 0.008 260)" stroke="white" strokeWidth="1.5" />
        {/* Cargo box */}
        <rect x="2" y="-7" width="12" height="14" rx="1" fill="white" fillOpacity="0.25" />
      </g>

      {/* Truck 2 — on secondary route, smaller */}
      <g transform="translate(195, 65)">
        <rect x="-14" y="-8" width="28" height="16" rx="3" fill="oklch(0.60 0.20 45)" opacity="0.85" />
        <circle cx="-8" cy="8" r="3.5" fill="oklch(0.14 0.008 260)" stroke="white" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="3.5" fill="oklch(0.14 0.008 260)" stroke="white" strokeWidth="1.5" />
        <rect x="-10" y="-5" width="9" height="11" rx="1" fill="white" fillOpacity="0.20" />
        <rect x="1" y="-5" width="8" height="11" rx="1" fill="white" fillOpacity="0.18" />
      </g>

      {/* Package icons at nodes */}
      <g transform="translate(249, 56)" opacity="0.70">
        <rect x="-9" y="-9" width="18" height="18" rx="3" fill="oklch(0.72 0.20 48 / 0.20)" stroke="oklch(0.72 0.20 48 / 0.50)" strokeWidth="1" />
        <path d="M0 -4 L0 4 M-4 0 L4 0" stroke="oklch(0.80 0.18 50)" strokeWidth="1.5" strokeLinecap="round" />
      </g>

      {/* Status card floating */}
      <g transform="translate(140, 28)">
        <rect x="-50" y="-16" width="100" height="30" rx="8" fill="oklch(0.14 0.008 260)" stroke="oklch(1 0 0 / 0.10)" strokeWidth="1" />
        <circle cx="-34" cy="-1" r="4" fill="oklch(0.66 0.18 145)" />
        <rect x="-26" y="-6" width="40" height="4" rx="2" fill="oklch(1 0 0 / 0.12)" />
        <rect x="-26" y="2" width="28" height="3" rx="1.5" fill="oklch(1 0 0 / 0.07)" />
        <rect x="20" y="-5" width="22" height="10" rx="4" fill="oklch(0.66 0.18 145 / 0.20)" />
        <rect x="23" y="-2" width="16" height="4" rx="2" fill="oklch(0.66 0.18 145 / 0.60)" />
      </g>

      {/* Pulsing rings on main truck node */}
      <circle cx="140" cy="100" r="14" stroke="oklch(0.72 0.20 48 / 0.15)" strokeWidth="1" fill="none" />
      <circle cx="140" cy="100" r="22" stroke="oklch(0.72 0.20 48 / 0.07)" strokeWidth="1" fill="none" />
    </svg>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left — branded illustration panel (desktop only) */}
      <AuthPanel />

      {/* Right — the form */}
      <div className="relative flex flex-col justify-center bg-background px-6 py-12 sm:px-10 lg:px-16">
        {/* Subtle top wash */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64"
          style={{
            background:
              "radial-gradient(60% 80% at 50% 0%, oklch(0.72 0.20 48 / 0.06), transparent 80%)",
          }}
        />

        <div className="relative w-full max-w-sm mx-auto">
          {/* Logo — shown only on mobile (desktop has it in left panel) */}
          <Link
            to="/"
            aria-label="FlowERP — home"
            className="mb-10 inline-flex items-center gap-2.5 self-start rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:hidden"
          >
            <LogoMark size={28} />
            <Wordmark />
          </Link>

          <div>
            <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
            )}
          </div>

          <div className="mt-8">{children}</div>

          {footer && (
            <div className="mt-8 border-t border-border/60 pt-6 text-sm text-muted-foreground">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
