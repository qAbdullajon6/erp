import { useNavigate, useSearch } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BillingTab } from "@/routes/app.billing";
import { BillingOverviewTab } from "./billing-overview-tab";
import { PlansTab } from "./plans-tab";
import { SubscriptionTab } from "./subscription-tab";
import { UsageDashboardTab } from "./usage-dashboard-tab";
import { PaymentProvidersTab } from "./payment-providers-tab";
import { SettingsTab } from "./settings-tab";
import { SettingsLayout } from "@/components/settings/settings-layout";

export function BillingView() {
  const navigate = useNavigate({ from: "/app/billing" });
  const search = useSearch({ from: "/app/billing" });
  const tab: BillingTab = search.tab ?? "overview";

  const setTab = (next: string) => {
    void navigate({
      to: "/app/billing",
      search: (prev) => ({ ...prev, tab: next === "overview" ? undefined : (next as BillingTab) }),
    });
  };

  return (
    <SettingsLayout
      activeSection="/app/billing"
      title="Billing"
      subtitle="Manage this organization's subscription, plan, usage and renewal settings."
    >
      <Tabs value={tab} onValueChange={setTab}>
        {/* TabsList scrolls its own overflow now, so the wrapper that used to
            provide that here would only add a second scroll container. */}
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="providers">Payment Providers</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-6">
          <BillingOverviewTab />
        </TabsContent>
        <TabsContent value="plans" className="pt-6">
          <PlansTab />
        </TabsContent>
        <TabsContent value="subscription" className="pt-6">
          <SubscriptionTab />
        </TabsContent>
        <TabsContent value="usage" className="pt-6">
          <UsageDashboardTab />
        </TabsContent>
        <TabsContent value="providers" className="pt-6">
          <PaymentProvidersTab />
        </TabsContent>
        <TabsContent value="settings" className="pt-6">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </SettingsLayout>
  );
}
