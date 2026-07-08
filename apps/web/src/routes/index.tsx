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
import { isAuthenticated } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FlowERP AI — Intelligent Logistics Command Center" },
      {
        name: "description",
        content:
          "FlowERP AI unifies orders, dispatch, tracking, fleet, and finance for modern logistics teams — with an AI assistant that answers operational questions in seconds.",
      },
      { property: "og:title", content: "FlowERP AI — Intelligent Logistics Command Center" },
      {
        property: "og:description",
        content:
          "The AI-native ERP for logistics. Run every delivery from one intelligent command center.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    if (isAuthenticated()) navigate({ to: "/app", replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <AISection />
        <Contact />
      </main>
      <Footer />
      <DemoModal />
    </div>
  );
}
