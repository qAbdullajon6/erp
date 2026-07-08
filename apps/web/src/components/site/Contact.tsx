import { Mail, Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";

export function Contact() {
  return (
    <section id="contact" className="relative border-t border-border/60 py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="overflow-hidden rounded-3xl border border-border/60 bg-surface/70 p-10 shadow-elevated sm:p-14">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-brand">Contact</div>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Talk to Our Logistics Software Team
              </h2>
              <p className="mt-4 text-muted-foreground">
                Have questions about FlowERP AI or want to discuss your workflow? Reach us directly.
              </p>
              <div className="mt-6">
                <Button
                  onClick={openDemoModal}
                  className="h-11 bg-gradient-brand px-5 text-brand-foreground hover:opacity-90"
                >
                  Request a Personalized Demo
                </Button>
              </div>
            </div>

            <ul className="space-y-3">
              <ContactRow
                icon={Mail}
                label="Email"
                value="hello@itechnology.uz"
                href="mailto:hello@itechnology.uz"
              />
              <ContactRow
                icon={Phone}
                label="Phone"
                value="+998 50 108 18 24"
                href="tel:+998501081824"
              />
              <ContactRow
                icon={MessageCircle}
                label="WhatsApp"
                value="+998 50 108 18 24"
                href="https://wa.me/998501081824"
              />
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <li>
      <a
        href={href}
        className="group flex items-center gap-4 rounded-xl border border-border/60 bg-background/40 px-4 py-3 transition-colors hover:border-brand/40 hover:bg-surface"
      >
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand/15 text-brand">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="font-medium text-foreground group-hover:text-brand">{value}</div>
        </div>
      </a>
    </li>
  );
}
