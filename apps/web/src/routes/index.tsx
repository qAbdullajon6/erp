import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Navbar } from "@/components/site/Navbar";
import { HeroV2 } from "@/components/site/v2/HeroV2";
import { TrustBarV2 } from "@/components/site/v2/TrustBarV2";
import { ProblemSolutionV2 } from "@/components/site/v2/ProblemSolutionV2";
import { ProductDemoV2 } from "@/components/site/v2/ProductDemoV2";
import { PlatformV2 } from "@/components/site/v2/PlatformV2";
import { TestimonialsV2 } from "@/components/site/v2/TestimonialsV2";
import { PricingV2 } from "@/components/site/v2/PricingV2";
import { FAQV2 } from "@/components/site/v2/FAQV2";
import { CTAV2 } from "@/components/site/v2/CTAV2";
import { Contact } from "@/components/site/Contact";
import { Footer } from "@/components/site/Footer";
import { DemoModal } from "@/components/site/DemoModal";
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
        <HeroV2 />
        <TrustBarV2 />
        <ProblemSolutionV2 />
        <ProductDemoV2 />
        <PlatformV2 />
        <TestimonialsV2 />
        <PricingV2 />
        <FAQV2 />
        <CTAV2 />
        <Contact />
      </main>
      <Footer />
      <DemoModal />
      <MobileCTA />
    </div>
  );
}
