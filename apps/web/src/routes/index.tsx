import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Navbar } from "@/components/site/Navbar";
import { Hero } from "@/components/site/Hero";
import { Features } from "@/components/site/Features";
import { HowItWorks } from "@/components/site/HowItWorks";
import { AISection } from "@/components/site/AISection";
import { Contact } from "@/components/site/Contact";
import { Footer } from "@/components/site/Footer";
import { DemoModal } from "@/components/site/DemoModal";
import { ProofBand } from "@/components/site/ProofBand";
import { Faq } from "@/components/site/Faq";
import { Pricing } from "@/components/site/Pricing";
import { Integrations } from "@/components/site/Integrations";
import { sessionManager } from "@/lib/api/session";
import { useScrollDepthTracking } from "@/lib/analytics/hooks";
import { MobileCTA } from "@/components/site/MobileCTA";

import { generateMetaTags, generateLinkTags, defaultSEO } from "@/lib/seo/meta-tags";
import {
  getOrganizationSchema,
  getSoftwareApplicationSchema,
  serializeSchema,
} from "@/lib/seo/structured-data";

export const Route = createFileRoute("/")({
  head: () => {
    const { meta, canonical } = generateMetaTags(defaultSEO);
    const links = generateLinkTags({ canonical });

    // Generate structured data schemas
    const organizationSchema = getOrganizationSchema();
    const softwareSchema = getSoftwareApplicationSchema();

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "theme-color", content: "#4F46E5" },
        ...meta,
      ],
      links,
      scripts: [
        {
          type: "application/ld+json",
          children: serializeSchema(organizationSchema as unknown as Record<string, unknown>),
        },
        {
          type: "application/ld+json",
          children: serializeSchema(softwareSchema as unknown as Record<string, unknown>),
        },
      ],
    };
  },
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  // Track scroll depth automatically
  useScrollDepthTracking();

  useEffect(() => {
    // Reads the real session. This used to consult a `flowerp_authed`
    // localStorage flag that nothing in the app ever wrote, so a signed-in
    // visitor always landed on the marketing page.
    if (sessionManager.hasValidSession()) navigate({ to: "/app", replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <ProofBand />
        <Features />
        <HowItWorks />
        <AISection />
        <Pricing />
        <Faq />
        <Integrations />
        <Contact />
      </main>
      <Footer />
      <DemoModal />
      <MobileCTA />
    </div>
  );
}
