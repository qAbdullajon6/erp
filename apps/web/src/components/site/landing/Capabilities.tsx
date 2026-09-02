import {
  Package,
  Route as RouteIcon,
  Truck,
  Wallet,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Section, SectionHeading } from "./primitives";
import { Reveal } from "./motion";
import { cn } from "@/lib/utils";

const MODULES: {
  icon: LucideIcon;
  name: string;
  desc: string;
  points: string[];
  accent: string;
}[] = [
  {
    icon: Package,
    name: "Orders",
    desc: "Every job from request to proof of delivery — tracked in real time.",
    points: [
      "Create orders with customer, route and cargo details",
      "Document attachments and proof of delivery",
      "Status history on every order",
      "Import orders from spreadsheets",
    ],
    accent: "oklch(0.62 0.22 45)",
  },
  {
    icon: RouteIcon,
    name: "Dispatch",
    desc: "Assign drivers and vehicles, watch jobs progress live on a board.",
    points: [
      "Kanban board, list and calendar views",
      "Drag-and-drop driver & vehicle assignment",
      "Conflict detection before you commit",
      "Real-time dispatch status updates",
    ],
    accent: "oklch(0.60 0.20 160)",
  },
  {
    icon: Truck,
    name: "Fleet & Tracking",
    desc: "Your vehicles on a live map — with trip history and alerts.",
    points: [
      "Live GPS map with all active vehicles",
      "Full trip replay for any route",
      "Geofence zones and entry/exit alerts",
      "Vehicle maintenance schedules",
    ],
    accent: "oklch(0.58 0.20 250)",
  },
  {
    icon: Wallet,
    name: "Finance",
    desc: "Invoice delivered work, record payments and see what you're owed.",
    points: [
      "One-click invoices from delivered orders",
      "Payment recording and tracking",
      "Revenue and expense reports",
      "Customer payment history",
    ],
    accent: "oklch(0.62 0.22 45)",
  },
  {
    icon: Users,
    name: "CRM",
    desc: "All your customers and their full order history in one place.",
    points: [
      "Customer directory with full profiles",
      "Order history per customer",
      "Customer portal for self-service",
      "Notes and communication history",
    ],
    accent: "oklch(0.60 0.20 160)",
  },
  {
    icon: Sparkles,
    name: "AI Assistant",
    desc: "Ask questions about your live operation in plain language.",
    points: [
      "Answers grounded in your live data",
      "Available on every screen",
      "Asks for confirmation before any change",
      "Works in Uzbek, Russian and English",
    ],
    accent: "oklch(0.58 0.20 300)",
  },
];

export function Capabilities() {
  const sectionRef = useSectionVisibility("capabilities");

  return (
    <Section id="capabilities" sectionRef={sectionRef} className="scroll-mt-16">
      <SectionHeading
        eyebrow="Platform"
        title="Everything a logistics company needs"
        lead="Six modules, one shared data model. Update a delivery once and dispatch, finance and the customer view all move with it — automatically."
      />

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((mod, i) => (
          <Reveal key={mod.name} delay={i * 55}>
            <div
              className={cn(
                "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface p-6 transition-all duration-300",
                "hover:-translate-y-1 hover:shadow-[0_8px_30px_-8px_oklch(0_0_0/0.15)]",
              )}
            >
              {/* Accent glow on hover */}
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{ background: `radial-gradient(circle, ${mod.accent}20, transparent 70%)` }}
              />

              {/* Icon */}
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: `${mod.accent}18`, color: mod.accent }}
              >
                <mod.icon className="h-5 w-5" />
              </div>

              <h3 className="mt-4 text-base font-bold text-foreground">{mod.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{mod.desc}</p>

              <ul className="mt-5 space-y-2 border-t border-border/60 pt-5">
                {mod.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span
                      className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: mod.accent }}
                    />
                    {p}
                  </li>
                ))}
              </ul>

              {/* Bottom accent line */}
              <div
                className="absolute inset-x-0 bottom-0 h-[2px] scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                style={{ background: `linear-gradient(90deg, transparent, ${mod.accent}, transparent)` }}
              />
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
