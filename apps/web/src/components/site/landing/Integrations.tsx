import { MapPin, MessageCircle, CreditCard, Calculator, Send, Webhook, Code2, Download, KeyRound, type LucideIcon } from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Section, SectionHeading, Card, IconTile } from "./primitives";
import { Reveal } from "./motion";

const INTEGRATIONS: { icon: LucideIcon; name: string; category: string }[] = [
  { icon: MapPin, name: "Google Maps", category: "Routing & ETAs" },
  { icon: MessageCircle, name: "WhatsApp", category: "Customer updates" },
  { icon: CreditCard, name: "Stripe", category: "Payments" },
  { icon: Calculator, name: "QuickBooks", category: "Accounting sync" },
  { icon: Send, name: "Telegram", category: "Team alerts" },
  { icon: Webhook, name: "Webhooks", category: "Real-time events" },
];

const DEV = [
  { icon: Code2, title: "REST API", desc: "A clean, documented API for every object in the platform." },
  { icon: KeyRound, title: "Scoped keys", desc: "Granular, revocable access tokens for each integration." },
  { icon: Download, title: "Portable data", desc: "Export orders, customers, and finance to CSV or JSON anytime." },
];

export function Integrations() {
  const sectionRef = useSectionVisibility("integrations");

  return (
    <Section id="integrations" sectionRef={sectionRef} width="wide">
      <SectionHeading
        eyebrow="Integrations"
        title="Connects to the tools you already run"
        lead="Plug FlowERP into your maps, messaging, payments, and accounting — then extend it with a first-class API when you need more."
      />

      <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS.map((it, i) => (
          <Reveal key={it.name} delay={i * 60}>
            <Card interactive className="flex items-center gap-4 p-5">
              <IconTile>
                <it.icon className="h-5 w-5" />
              </IconTile>
              <div>
                <div className="text-sm font-semibold text-foreground">{it.name}</div>
                <div className="text-xs text-muted-foreground">{it.category}</div>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>

      <Reveal delay={80} className="mt-4">
        <Card className="grid gap-8 p-8 sm:grid-cols-3">
          {DEV.map((d) => (
            <div key={d.title}>
              <div className="flex items-center gap-2.5">
                <d.icon className="h-5 w-5 text-brand" />
                <h3 className="text-sm font-semibold text-foreground">{d.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d.desc}</p>
            </div>
          ))}
        </Card>
      </Reveal>
    </Section>
  );
}
