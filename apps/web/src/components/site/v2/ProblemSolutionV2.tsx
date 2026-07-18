import { X, Check } from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";

/**
 * Problem/Solution V2 - Motive/Samsara pattern
 *
 * Before/After comparison showing the pain vs. the solution
 * Speaks directly to ops manager frustrations
 */
export function ProblemSolutionV2() {
  const sectionRef = useSectionVisibility("problem_solution");

  const problems = [
    "Juggling WhatsApp groups, Excel sheets, and phone calls",
    "No visibility into where drivers are or what's delayed",
    "Manual route planning takes hours every morning",
    "Invoices don't match deliveries, customers complain",
    "No way to know which drivers are overloaded",
    "Can't answer 'Where's my delivery?' without 3 phone calls",
  ];

  const solutions = [
    "One unified command center for your entire operation",
    "Real-time tracking and AI-powered delay predictions",
    "AI optimizes routes automatically in seconds",
    "Invoices sync with actual deliveries, instant accuracy",
    "AI detects workload imbalances and suggests fixes",
    "Ask the AI—it knows every delivery's status instantly",
  ];

  return (
    <section ref={sectionRef} className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            Stop fighting fires.
            <br />
            <span className="text-brand">Start orchestrating.</span>
          </h2>
          <p className="mt-6 text-xl leading-relaxed text-muted-foreground">
            Operations managers waste 40+ hours per week on manual coordination.
            FlowERP gives you those hours back.
          </p>
        </div>

        {/* Before/After grid */}
        <div className="mt-20 grid gap-8 lg:grid-cols-2">
          {/* Before */}
          <div className="rounded-2xl border border-border/60 bg-surface/40 p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <X className="h-6 w-6" strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Without FlowERP</h3>
                <p className="text-sm text-muted-foreground">The daily chaos</p>
              </div>
            </div>
            <ul className="space-y-4">
              {problems.map((problem) => (
                <li key={problem} className="flex items-start gap-3">
                  <X className="mt-0.5 h-5 w-5 shrink-0 text-destructive/70" />
                  <span className="text-sm leading-relaxed text-foreground/80">{problem}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* After */}
          <div className="rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/5 via-transparent to-transparent p-8 shadow-lg shadow-brand/5">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/15 text-brand">
                <Check className="h-6 w-6" strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">With FlowERP</h3>
                <p className="text-sm text-muted-foreground">Orchestrated operations</p>
              </div>
            </div>
            <ul className="space-y-4">
              {solutions.map((solution) => (
                <li key={solution} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand" strokeWidth={2.5} />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {solution}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
