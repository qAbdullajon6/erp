import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Container } from "./primitives";
import { Reveal } from "./motion";

const COMPANIES = [
  "Aral Freight",
  "Silk Route",
  "Turon Cargo",
  "Nexo Retail",
  "Bereke Logistics",
  "Alfa Trade",
  "Zamin Transport",
  "Central Express",
];

export function Proof() {
  const sectionRef = useSectionVisibility("proof");

  return (
    <section
      ref={sectionRef}
      className="relative border-y border-border/60 bg-surface/30 py-14 sm:py-16"
    >
      <Container width="wide">
        <Reveal>
          <p className="text-center text-sm text-muted-foreground">
            Trusted by logistics teams moving{" "}
            <span className="font-semibold text-foreground">10,000+ deliveries a day</span> across
            Central Asia
          </p>
        </Reveal>

        <div className="lv2-pause lv2-mask-x group relative mt-9 overflow-hidden">
          <div className="lv2-marquee flex w-max items-center gap-14 pr-14">
            {[...COMPANIES, ...COMPANIES].map((name, i) => (
              <LogoWord key={`${name}-${i}`} name={name} index={i} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

function LogoWord({ name, index }: { name: string; index: number }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 text-muted-foreground/70 transition-colors">
      <Mark index={index} />
      <span className="whitespace-nowrap font-display text-lg font-semibold tracking-tight">
        {name}
      </span>
    </div>
  );
}

/** A small, neutral geometric glyph — varies by index so the wall reads as
 *  distinct marks without inventing real brand logos. */
function Mark({ index }: { index: number }) {
  const shape = index % 4;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="opacity-80">
      {shape === 0 && <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.7" />}
      {shape === 1 && <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />}
      {shape === 2 && (
        <path d="M12 3l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      )}
      {shape === 3 && (
        <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9L12 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      )}
    </svg>
  );
}
