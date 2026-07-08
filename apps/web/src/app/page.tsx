'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/site/Navbar';
import { Hero } from '@/components/site/Hero';
import { Features } from '@/components/site/Features';
import { HowItWorks } from '@/components/site/HowItWorks';
import { AISection } from '@/components/site/AISection';
import { Contact } from '@/components/site/Contact';
import { Footer } from '@/components/site/Footer';
import { DemoModal } from '@/components/site/DemoModal';

export default function RootPage() {
  const router = useRouter();
  const [showLanding, setShowLanding] = useState(true);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if user is authenticated by attempting to fetch protected endpoint
    const checkAuth = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch('/api/onboarding/progress', {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.status === 200) {
          // User is authenticated - redirect to app
          router.replace('/app');
          return;
        }
      } catch (error) {
        // Network error, timeout, or endpoint doesn't exist - show landing page
      }

      setShowLanding(true);
      setIsChecking(false);
    };

    checkAuth();
  }, [router]);

  // While checking auth, show loading state
  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!showLanding) {
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <AISection />
      <Contact />
      <Footer />
      <DemoModal />
    </div>
  );
}
