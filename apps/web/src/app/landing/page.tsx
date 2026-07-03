import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero-section";
import { ProblemsSection } from "@/components/landing/problems-section";
import { SolutionsSection } from "@/components/landing/solutions-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { RolesSection } from "@/components/landing/roles-section";
import { KpiShowcaseSection } from "@/components/landing/kpi-showcase-section";
import { SecurityNoteSection } from "@/components/landing/security-note-section";
import { FinalCtaSection } from "@/components/landing/final-cta-section";
import { LandingFooter } from "@/components/landing/landing-footer";

export const metadata: Metadata = {
  title: "FlowERP AI — Intelligent Logistics Operations Platform",
  description:
    "Order management, smart dispatch, customer CRM, finance control, reporting and an AI operations assistant in one logistics platform. Explore the interactive live demo.",
};

export default function LandingPage() {
  return (
    <div className="min-h-full">
      <LandingHeader />
      <main>
        <HeroSection />
        <ProblemsSection />
        <SolutionsSection />
        <HowItWorksSection />
        <RolesSection />
        <KpiShowcaseSection />
        <SecurityNoteSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
