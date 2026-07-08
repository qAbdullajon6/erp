import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Mail, Phone, MessageCircle } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              The AI-native ERP for logistics teams. Run every delivery from one intelligent command center.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Product</div>
            <ul className="mt-4 space-y-2 text-sm">
              <li><a href="#features" className="text-foreground/80 hover:text-foreground">Features</a></li>
              <li><a href="#workflow" className="text-foreground/80 hover:text-foreground">How it works</a></li>
              <li><a href="#ai" className="text-foreground/80 hover:text-foreground">AI Assistant</a></li>
              <li><Link href="/auth/login" className="text-foreground/80 hover:text-foreground">Sign In</Link></li>
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Contact</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a href="mailto:hello@itechnology.uz" className="inline-flex items-center gap-2 text-foreground/80 hover:text-foreground">
                  <Mail className="h-3.5 w-3.5" /> hello@itechnology.uz
                </a>
              </li>
              <li>
                <a href="tel:+998501081824" className="inline-flex items-center gap-2 text-foreground/80 hover:text-foreground">
                  <Phone className="h-3.5 w-3.5" /> +998 50 108 18 24
                </a>
              </li>
              <li>
                <a href="https://wa.me/998501081824" className="inline-flex items-center gap-2 text-foreground/80 hover:text-foreground">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <div>© {new Date().getFullYear()} FlowERP AI. All rights reserved.</div>
          <div>Made for modern logistics teams.</div>
        </div>
      </div>
    </footer>
  );
}
