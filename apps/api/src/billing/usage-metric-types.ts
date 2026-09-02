import { UsageMetricType } from "@prisma/client";

export const TRACKED_USAGE_METRICS: UsageMetricType[] = [
  UsageMetricType.API_REQUESTS,
  UsageMetricType.AI_CREDITS,
  UsageMetricType.STORAGE_GB,
  UsageMetricType.ORDERS,
  UsageMetricType.WEBHOOKS,
  UsageMetricType.USERS,
  UsageMetricType.VEHICLES,
  UsageMetricType.DRIVERS,
  UsageMetricType.CUSTOMERS,
];
