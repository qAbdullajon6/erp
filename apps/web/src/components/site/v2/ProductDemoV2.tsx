import { useState } from "react";
import { Sparkles, Play, Pause } from "lucide-react";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { analytics } from "@/lib/analytics";

/**
 * Product Demo V2 - Linear/Notion style
 *
 * Pattern: Large embedded video/demo showing the product in action
 * Tabs allow exploring different workflows
 * Focus on showing, not telling
 */
export function ProductDemoV2() {
  const sectionRef = useSectionVisibility("product_demo");
  const [activeTab, setActiveTab] = useState<"ai" | "dispatch" | "fleet">("ai");
  const [isPlaying, setIsPlaying] = useState(false);

  const handleTabClick = (tab: "ai" | "dispatch" | "fleet") => {
    setActiveTab(tab);
    analytics.track({ name: "product_demo_tab_click", params: { tab } });
  };

  const demoContent = {
    ai: {
      title: "AI Command Center",
      description: "Ask questions, get answers, take action—all in natural language",
      videoPlaceholder: "AI Assistant Demo",
    },
    dispatch: {
      title: "Smart Dispatch",
      description: "AI-optimized route assignment that saves hours every morning",
      videoPlaceholder: "Dispatch Optimization Demo",
    },
    fleet: {
      title: "Fleet Management",
      description: "Real-time tracking, utilization analytics, maintenance scheduling",
      videoPlaceholder: "Fleet Management Demo",
    },
  };

  const current = demoContent[activeTab];

  return (
    <section id="product-demo" ref={sectionRef} className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand">
            <Sparkles className="h-4 w-4" />
            See it in action
          </div>
          <h2 className="mt-6 font-display text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            Your operation,
            <br />
            <span className="text-brand">finally under control</span>
          </h2>
        </div>

        {/* Tab navigation */}
        <div className="mt-12 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-surface/40 p-1.5">
            {(["ai", "dispatch", "fleet"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabClick(tab)}
                className={`rounded-lg px-6 py-2.5 text-sm font-semibold capitalize transition-all ${
                  activeTab === tab
                    ? "bg-brand text-brand-foreground shadow-lg shadow-brand/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "ai" ? "AI Assistant" : tab}
              </button>
            ))}
          </div>
        </div>

        {/* Demo content */}
        <div className="mt-12">
          <div className="mb-6 text-center">
            <h3 className="text-2xl font-bold text-foreground">{current.title}</h3>
            <p className="mt-2 text-lg text-muted-foreground">{current.description}</p>
          </div>

          {/* Video placeholder - would be real product demo video */}
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl">
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-brand/20 to-transparent opacity-60 blur-xl" />
            <div className="relative aspect-video bg-gradient-to-br from-muted/40 to-background">
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <button
                    onClick={() => {
                      setIsPlaying(!isPlaying);
                      analytics.track({
                        name: "product_demo_video_play",
                        params: { tab: activeTab },
                      });
                    }}
                    className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-2xl shadow-brand/30 transition-transform hover:scale-105"
                  >
                    {isPlaying ? (
                      <Pause className="h-8 w-8" fill="currentColor" />
                    ) : (
                      <Play className="ml-1 h-8 w-8" fill="currentColor" />
                    )}
                  </button>
                  <p className="font-display text-xl font-semibold text-muted-foreground">
                    {current.videoPlaceholder}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground/60">
                    Video demo coming soon
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
