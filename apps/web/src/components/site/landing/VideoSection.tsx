import { useState } from "react";
import { Play, Truck, LayoutDashboard, FileText } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { useSectionVisibility } from "@/lib/analytics/hooks";
import { Section, SectionHeading } from "./primitives";
import { Reveal } from "./motion";

const TABS = [
  { id: "dispatch", label: "Dispatch board", icon: LayoutDashboard },
  { id: "fleet", label: "Fleet tracking", icon: Truck },
  { id: "ai", label: "AI assistant", icon: FileText },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function VideoSection() {
  const sectionRef = useSectionVisibility("demo");
  const [activeTab, setActiveTab] = useState<TabId>("dispatch");
  const [playing, setPlaying] = useState(false);

  const handleTabClick = (tab: TabId) => {
    analytics.track({ name: "product_demo_tab_click", params: { tab } });
    setActiveTab(tab);
    setPlaying(false);
  };

  const handlePlay = () => {
    analytics.track({ name: "product_demo_video_play", params: { tab: activeTab } });
    setPlaying(true);
  };

  return (
    <Section id="demo" sectionRef={sectionRef} className="scroll-mt-16" backdrop="grid">
      <SectionHeading
        eyebrow="See it in action"
        title="Watch FlowERP run a real operation"
        lead="From morning dispatch to end-of-day invoicing — see how a logistics team runs the full day inside FlowERP."
      />

      {/* Tab switcher */}
      <Reveal delay={100}>
        <div className="mt-10 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Video player */}
      <Reveal delay={160}>
        <div className="relative mx-auto mt-8 max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-elevated)]">
          {/* Aspect ratio box */}
          <div className="relative aspect-video w-full bg-surface">
            {playing ? (
              /* Replace src with the actual video path when ready */
              <video
                className="h-full w-full object-cover"
                controls
                autoPlay
                src="/demo-video.mp4"
              >
                Your browser does not support video playback.
              </video>
            ) : (
              /* Placeholder shown until user clicks play */
              <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-gradient-to-br from-surface to-muted/40 p-8">
                {/* Placeholder illustration */}
                <div className="relative">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-brand/30 bg-brand/10">
                    <button
                      onClick={handlePlay}
                      aria-label="Play demo video"
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95"
                    >
                      <Play className="h-7 w-7 translate-x-0.5 fill-current" />
                    </button>
                  </div>
                  {/* Pulsing ring */}
                  <span className="absolute inset-0 rounded-full border-2 border-brand/20 animate-ping" />
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-foreground">
                    {TABS.find((t) => t.id === activeTab)?.label} — demo video
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Video will be available soon. Add your video file to{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                      /public/demo-video.mp4
                    </code>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Reveal>

      {/* Caption */}
      <Reveal delay={220}>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Real platform, real operations — no staged screens.
        </p>
      </Reveal>
    </Section>
  );
}
