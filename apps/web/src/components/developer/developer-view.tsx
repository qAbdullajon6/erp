import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiKeysTab } from './api-keys-tab';
import { WebhooksTab } from './webhooks-tab';
import { DeliveriesTab } from './deliveries-tab';
import { UsageTab } from './usage-tab';

export function DeveloperView() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Developer</h1>
        <p className="mt-2 text-muted-foreground">Manage API keys, webhooks, and view usage analytics</p>
      </div>

      <Tabs defaultValue="api-keys">
        <TabsList>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>
        <TabsContent value="api-keys" className="pt-4">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="webhooks" className="pt-4">
          <WebhooksTab />
        </TabsContent>
        <TabsContent value="deliveries" className="pt-4">
          <DeliveriesTab />
        </TabsContent>
        <TabsContent value="usage" className="pt-4">
          <UsageTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
