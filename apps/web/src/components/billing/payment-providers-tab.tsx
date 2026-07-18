import { CreditCard, Landmark, Wallet, ShieldCheck, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Badge } from "@/components/ui/badge";

/// The provider TYPES the billing backend supports (PaymentProviderRegistry:
/// STRIPE / CLICK / PAYME). Their credentials are configured server-side and
/// stored AES-256-CBC-encrypted; there is deliberately no read/write endpoint
/// that exposes them, so this page is informational rather than a management
/// surface. See the tech-debt note in the implementation report.
const PROVIDERS: Array<{ name: string; icon: LucideIcon; region: string; description: string }> = [
  {
    name: "Stripe",
    icon: CreditCard,
    region: "International",
    description: "Cards and wallets via Stripe. Payments confirm through the signed Stripe webhook.",
  },
  {
    name: "Click",
    icon: Wallet,
    region: "Uzbekistan",
    description: "Click.uz two-phase (prepare / complete) flow with MD5-HMAC signature verification.",
  },
  {
    name: "Payme",
    icon: Landmark,
    region: "Uzbekistan",
    description: "Payme.uz JSON-RPC merchant API authenticated with HTTP Basic credentials.",
  },
];

export function PaymentProvidersTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Payment provider credentials are configured on the server and stored encrypted. This view lists the
          providers the platform can process payments through; credential management is not exposed through the
          app.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PROVIDERS.map((provider) => (
          <SurfaceCard key={provider.name} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <span className="rounded-xl bg-brand/10 p-2.5 text-brand">
                <provider.icon className="h-5 w-5" />
              </span>
              <Badge variant="muted" className="gap-1">
                <ShieldCheck className="h-3 w-3" /> Server-managed
              </Badge>
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{provider.name}</h3>
            <p className="text-xs text-muted-foreground">{provider.region}</p>
            <p className="mt-3 text-sm text-muted-foreground">{provider.description}</p>
          </SurfaceCard>
        ))}
      </div>
    </div>
  );
}
