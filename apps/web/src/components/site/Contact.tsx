import { Mail, Phone, MessageCircle, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openDemoModal } from "@/components/site/DemoModal";

export function Contact() {
  return (
    <section id="contact" className="relative border-t border-border/60 py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-brand/30 bg-gradient-to-br from-brand/10 via-brand/5 to-transparent p-12 shadow-2xl sm:p-16">
          {/* Background pattern */}
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:radial-gradient(white,transparent_70%)]" />

          <div className="relative grid items-center gap-12 md:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/15 px-4 py-1.5 text-xs font-semibold text-brand backdrop-blur">
                Contact
              </div>
              <h2 className="mt-5 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Talk to Our Team
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Have questions about FlowERP AI or want to discuss your workflow? Reach us directly.
              </p>
              <div className="mt-8">
                <Button
                  onClick={openDemoModal}
                  size="lg"
                  className="h-12 bg-gradient-brand px-6 text-brand-foreground shadow-brand hover:scale-[1.02] hover:shadow-2xl"
                >
                  Get a Demo
                </Button>
              </div>
            </div>

            <ul className="space-y-3">
              <ContactRow
                icon={Globe}
                label="Website"
                value="itechnology.uz"
                href="https://itechnology.uz/"
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
              <ContactRow
                icon={Mail}
                label="Email"
                value="hello@itechnology.uz"
                href="mailto:hello@itechnology.uz"
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
        className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-background/60 px-5 py-4 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:bg-surface hover:shadow-lg"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/15 text-brand transition-transform group-hover:scale-110">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-0.5 font-semibold text-foreground group-hover:text-brand">{value}</div>
        </div>
      </a>
    </li>
  );
}
