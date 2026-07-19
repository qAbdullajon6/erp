import { Module } from "@nestjs/common";
import { BillingSeatsService } from "./billing-seats.service";
import { FeatureGateService } from "./feature-gate.service";
import { UsageMeteringService } from "./usage-metering.service";
import { SubscriptionPlanService } from "./subscription-plan.service";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";
import { SubscriptionsController } from "./subscriptions.controller";
import { PlansController } from "./plans.controller";
import { StripeWebhookController } from "./webhooks/stripe-webhook.controller";
import { ClickWebhookController } from "./webhooks/click-webhook.controller";
import { PaymeWebhookController } from "./webhooks/payme-webhook.controller";
import { SubscriptionRenewalWorker } from "./subscription-renewal.worker";
import { UsageSnapshotWorker } from "./usage-snapshot.worker";
import { BillingNotificationService } from "./billing-notification.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [
    SubscriptionsController,
    PlansController,
    StripeWebhookController,
    ClickWebhookController,
    PaymeWebhookController,
  ],
  providers: [
    FeatureGateService,
    BillingSeatsService,
    UsageMeteringService,
    SubscriptionPlanService,
    SubscriptionLifecycleService,
    PaymentProviderRegistry,
    SubscriptionRenewalWorker,
    UsageSnapshotWorker,
    BillingNotificationService,
  ],
  exports: [
    FeatureGateService,
    BillingSeatsService,
    UsageMeteringService,
    SubscriptionPlanService,
    SubscriptionLifecycleService,
    PaymentProviderRegistry,
    BillingNotificationService,
  ],
})
export class BillingModule {}
