import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPreviewMockup } from "@/components/landing/product-preview-mockup";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[500px] bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />
      <div className="mx-auto grid max-w-6xl gap-12 px-6 pt-20 pb-16 lg:grid-cols-2 lg:items-center lg:pt-28">
        <div>
          <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            Intelligent Logistics Operations Platform
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            FlowERP AI brings order, dispatch, finance and fleet visibility into one platform.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            Replace scattered spreadsheets, phone calls and messaging apps with a single
            operations workspace — from order intake to driver assignment, invoicing and
            performance reporting.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" asChild className="gap-2">
              <Link href="/">
                Explore Live Demo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/">View Operations Dashboard</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Interactive product demo. No signup required.
          </p>
        </div>

        <ProductPreviewMockup />
      </div>
    </section>
  );
}
