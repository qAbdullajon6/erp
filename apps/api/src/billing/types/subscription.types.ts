import type { OrganizationSubscription, SubscriptionPlan } from "@prisma/client";

export type SubscriptionWithPlan = OrganizationSubscription & {
  plan: SubscriptionPlan;
};
