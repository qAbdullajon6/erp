import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Nav } from "@/components/site/landing/Nav";
import { Hero } from "@/components/site/landing/Hero";
import { VideoSection } from "@/components/site/landing/VideoSection";
import { Capabilities } from "@/components/site/landing/Capabilities";
import { HowItWorks } from "@/components/site/landing/HowItWorks";
import { SocialProof } from "@/components/site/landing/SocialProof";
import { Pricing } from "@/components/site/landing/Pricing";
import { FAQ } from "@/components/site/landing/FAQ";
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
  getWebSiteSchema,
  getSoftwareApplicationSchema,
  serializeSchema,
} from "@/lib/seo/structured-data";

export const Route = createFileRoute("/")({
  head: () => {
    const { meta, canonical } = generateMetaTags(defaultSEO);
    const links = generateLinkTags({ canonical });

    // Generate structured data schemas
    const organizationSchema = getOrganizationSchema();
    const webSiteSchema = getWebSiteSchema();
    const softwareSchema = getSoftwareApplicationSchema();

    return {
      meta: [
        { charSet: "utf-8" },
        // viewport is already declared once in __root.tsx's head() — this
        // route inherits it; repeating the identical tag here just produced
        // a redundant duplicate in the rendered <head>.
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
          children: serializeSchema(webSiteSchema as unknown as Record<string, unknown>),
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
      <Nav />
      <main id="main-content">
        <Hero />
        <VideoSection />
        <Capabilities />
        <HowItWorks />
        <SocialProof />
        <Pricing />
        <FAQ />
        <Closing />
      </main>
      <Footer />
      <DemoModal />
      <MobileCTA />
      <ConsentBanner />
    </div>
  );
}
