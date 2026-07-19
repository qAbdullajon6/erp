import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Nav } from "@/components/site/landing/Nav";
import { Hero } from "@/components/site/landing/Hero";
import { Proof } from "@/components/site/landing/Proof";
import { Platform } from "@/components/site/landing/Platform";
import { AISection } from "@/components/site/landing/AISection";
import { Dispatch } from "@/components/site/landing/Dispatch";
import { Results } from "@/components/site/landing/Results";
import { Integrations } from "@/components/site/landing/Integrations";
import { Pricing } from "@/components/site/landing/Pricing";
import { Faq, FAQS } from "@/components/site/landing/Faq";
import { Closing } from "@/components/site/landing/Closing";
import { Footer } from "@/components/site/landing/Footer";
import { MobileCTA } from "@/components/site/landing/MobileCTA";
import { DemoModal } from "@/components/site/DemoModal";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { sessionManager } from "@/lib/api/session";
import { useScrollDepthTracking } from "@/lib/analytics/hooks";

import { generateMetaTags, generateLinkTags, defaultSEO } from "@/lib/seo/meta-tags";
import {
  getOrganizationSchema,
  getSoftwareApplicationSchema,
  getFAQPageSchema,
  serializeSchema,
} from "@/lib/seo/structured-data";

export const Route = createFileRoute("/")({
  head: () => {
    const { meta, canonical } = generateMetaTags(defaultSEO);
    const links = generateLinkTags({ canonical });

    // Generate structured data schemas
    const organizationSchema = getOrganizationSchema();
    const softwareSchema = getSoftwareApplicationSchema();
    const faqSchema = getFAQPageSchema(FAQS.map((f) => ({ question: f.q, answer: f.a })));

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "theme-color", content: "#141726" },
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
        {
          type: "application/ld+json",
          children: serializeSchema(faqSchema as unknown as Record<string, unknown>),
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
      <Nav />
      <main>
        <Hero />
        <Proof />
        <Platform />
        <AISection />
        <Dispatch />
        <Results />
        <Integrations />
        <Pricing />
        <Faq />
        <Closing />
      </main>
      <Footer />
      <DemoModal />
      <MobileCTA />
      <ConsentBanner />
    </div>
  );
}
