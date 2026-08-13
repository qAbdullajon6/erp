import { useNavigate, useSearch } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BillingTab } from "@/routes/app.billing";
import { BillingOverviewTab } from "./billing-overview-tab";
import { PlansTab } from "./plans-tab";
import { SubscriptionTab } from "./subscription-tab";
import { UsageDashboardTab } from "./usage-dashboard-tab";
import { PaymentProvidersTab } from "./payment-providers-tab";
import { SettingsTab } from "./settings-tab";

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
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Billing</h1>
        <p className="mt-2 text-muted-foreground">
          Manage this organization&apos;s subscription, plan, usage and renewal settings.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Horizontal scroll keeps all six tabs reachable on narrow screens
            without wrapping the tab strip into two rows. */}
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="providers">Payment Providers</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </div>

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
    </div>
  );
}
