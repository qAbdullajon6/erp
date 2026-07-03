import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCtaSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          See how FlowERP AI runs a logistics operation end to end
        </h2>
        <p className="mt-3 text-muted-foreground">
          Explore the live demo with realistic sample data — no signup, no setup.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
      </div>
    </section>
  );
}
