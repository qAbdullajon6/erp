import { Link } from "@tanstack/react-router";
import { Mail, Phone, MessageCircle, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { siteConfig } from "@/lib/site-config";

const PRODUCT = [
  { label: "Platform", href: "#platform" },
  { label: "AI copilot", href: "#ai" },
  { label: "Dispatch", href: "#dispatch" },
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing", href: "#pricing" },
];

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              The AI operating system for logistics. Run every delivery from one intelligent command
              center.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                SOC 2 Type II
              </span>
              <span className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
                Built in Central Asia
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Product
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {PRODUCT.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-foreground/80 transition-colors hover:text-foreground">
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <Link to="/auth/sign-in" className="text-foreground/80 transition-colors hover:text-foreground">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Contact
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a href={siteConfig.contact.emailHref} className="inline-flex items-center gap-2 text-foreground/80 transition-colors hover:text-foreground">
                  <Mail className="h-3.5 w-3.5" /> {siteConfig.contact.email}
                </a>
              </li>
              <li>
                <a href={siteConfig.contact.phoneHref} className="inline-flex items-center gap-2 text-foreground/80 transition-colors hover:text-foreground">
                  <Phone className="h-3.5 w-3.5" /> {siteConfig.contact.phoneDisplay}
                </a>
              </li>
              {siteConfig.contact.whatsappHref && (
                <li>
                  <a href={siteConfig.contact.whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-foreground/80 transition-colors hover:text-foreground">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Legal
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link to="/privacy" className="text-foreground/80 transition-colors hover:text-foreground">
                  Privacy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-foreground/80 transition-colors hover:text-foreground">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <div>© {new Date().getFullYear()} FlowERP AI. All rights reserved.</div>
          <div>Made for modern logistics teams.</div>
        </div>
      </div>
    </footer>
  );
}
