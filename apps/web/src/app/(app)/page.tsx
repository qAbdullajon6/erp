"use client";

import { useEffect, useState } from "react";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { useApiSession } from "@/lib/api-session";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { DeliveryStatusChart } from "@/components/dashboard/delivery-status-chart";
import { DriverFleetStatus } from "@/components/dashboard/driver-fleet-status";
import { RecentOrdersTable } from "@/components/dashboard/recent-orders-table";
import { DelayedDeliveries } from "@/components/dashboard/delayed-deliveries";
import { DriverDashboardSummary } from "@/components/dashboard/driver-dashboard-summary";

interface OnboardingProgress {
  completed: boolean;
  skipped: boolean;
}

export default function DashboardPage() {
  const { session } = useApiSession();
  const [onboarding, setOnboarding] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch onboarding progress
    const fetchOnboarding = async () => {
      try {
        const res = await fetch("/api/onboarding/progress");
        if (res.ok) {
          const { data } = await res.json();
          setOnboarding(data);
        }
      } catch (error) {
        console.error("Failed to fetch onboarding progress:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOnboarding();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show onboarding wizard for new organizations
  if (onboarding && !onboarding.completed && !onboarding.skipped) {
    return <OnboardingWizard onOnboardingComplete={() => setOnboarding({ ...onboarding, completed: true })} userRole={session?.membership.role} />;
  }

  // Main dashboard
  // TODO: Add role-based dashboard selection when auth system is finalized

  // Main dashboard
  return (
    <div className="space-y-6">
      <KpiCards />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <DeliveryStatusChart />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentOrdersTable />
        </div>
        <div className="space-y-4">
          <DelayedDeliveries />
          <DriverFleetStatus />
        </div>
      </div>
    </div>
  );
}
