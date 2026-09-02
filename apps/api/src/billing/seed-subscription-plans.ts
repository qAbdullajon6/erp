import { PrismaClient } from "@prisma/client";

/// Subscription plan seeder - creates/updates default plans.
///
/// Run with: npx ts-node -r tsconfig-paths/register src/billing/seed-subscription-plans.ts
///
/// Idempotent: safe to run multiple times (upserts by slug)
///
/// Feature keys follow the canonical schema documented on SubscriptionPlanService
/// (users, vehicles, orders_per_month, storage_gb, custom_branding, ...) — this is
/// what FeatureGateService/UsageMeteringService actually look up when enforcing
/// plan limits. A previous version of this seeder used a different camelCase key
/// set (maxUsers, customBrandingEnabled, ...) that never matched what the
/// enforcement code reads, so every plan limit silently resolved as "unlimited".
///
/// Plans:
/// 1. Free (slug: "free") - $0/mo - trial/basic tier
/// 2. Starter (slug: "starter") - $49/mo - small businesses
/// 3. Professional (slug: "professional") - $149/mo - growing companies
/// 4. Enterprise (slug: "enterprise") - $499/mo - large organizations

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding subscription plans...");

  // Free Plan
  await prisma.subscriptionPlan.upsert({
    where: { slug: "free" },
    create: {
      name: "Free",
      slug: "free",
      description: "Perfect for trying out FlowERP",
      price: 0,
      annualPrice: null,
      currency: "USD",
      features: {
        // Boolean features (null = unlimited)
        analytics_enabled: true,
        api_access_enabled: false,
        custom_branding: false,
        priority_support: false,
        advanced_reporting: false,

        // Numeric limits (null = unlimited)
        users: 3,
        vehicles: 5,
        drivers: 5,
        customers: 25,
        orders_per_month: 50,
        storage_gb: 1,
        api_requests_per_day: 100,
        ai_credits_per_month: 10,
        webhooks_per_month: 0, // no webhooks on free plan
      },
      sortOrder: 0,
      isActive: true,
      isFeatured: false,
    },
    update: {
      description: "Perfect for trying out FlowERP",
      features: {
        analytics_enabled: true,
        api_access_enabled: false,
        custom_branding: false,
        priority_support: false,
        advanced_reporting: false,
        users: 3,
        vehicles: 5,
        drivers: 5,
        customers: 25,
        orders_per_month: 50,
        storage_gb: 1,
        api_requests_per_day: 100,
        ai_credits_per_month: 10,
        webhooks_per_month: 0,
      },
    },
  });

  // Starter Plan
  await prisma.subscriptionPlan.upsert({
    where: { slug: "starter" },
    create: {
      name: "Starter",
      slug: "starter",
      description: "For small businesses getting started with logistics operations",
      price: 4900, // $49.00 in cents
      annualPrice: 49000, // $490/year (2 months free)
      currency: "USD",
      features: {
        analytics_enabled: true,
        api_access_enabled: true,
        custom_branding: false,
        priority_support: false,
        advanced_reporting: false,
        users: 10,
        vehicles: 20,
        drivers: 20,
        customers: 100,
        orders_per_month: 500,
        storage_gb: 10,
        api_requests_per_day: 10000,
        ai_credits_per_month: 100,
        webhooks_per_month: 5,
      },
      sortOrder: 1,
      isActive: true,
      isFeatured: true,
    },
    update: {
      description: "For small businesses getting started with logistics operations",
      price: 4900,
      annualPrice: 49000,
      features: {
        analytics_enabled: true,
        api_access_enabled: true,
        custom_branding: false,
        priority_support: false,
        advanced_reporting: false,
        users: 10,
        vehicles: 20,
        drivers: 20,
        customers: 100,
        orders_per_month: 500,
        storage_gb: 10,
        api_requests_per_day: 10000,
        ai_credits_per_month: 100,
        webhooks_per_month: 5,
      },
    },
  });

  // Professional Plan
  await prisma.subscriptionPlan.upsert({
    where: { slug: "professional" },
    create: {
      name: "Professional",
      slug: "professional",
      description: "For growing companies with advanced logistics needs",
      price: 14900, // $149.00 in cents
      annualPrice: 149000, // $1490/year (2 months free)
      currency: "USD",
      features: {
        analytics_enabled: true,
        api_access_enabled: true,
        custom_branding: true,
        priority_support: true,
        advanced_reporting: true,
        users: 50,
        vehicles: 100,
        drivers: 100,
        customers: 1000,
        orders_per_month: 5000,
        storage_gb: 100,
        api_requests_per_day: 100000,
        ai_credits_per_month: 1000,
        webhooks_per_month: 25,
      },
      sortOrder: 2,
      isActive: true,
      isFeatured: true,
    },
    update: {
      description: "For growing companies with advanced logistics needs",
      price: 14900,
      annualPrice: 149000,
      features: {
        analytics_enabled: true,
        api_access_enabled: true,
        custom_branding: true,
        priority_support: true,
        advanced_reporting: true,
        users: 50,
        vehicles: 100,
        drivers: 100,
        customers: 1000,
        orders_per_month: 5000,
        storage_gb: 100,
        api_requests_per_day: 100000,
        ai_credits_per_month: 1000,
        webhooks_per_month: 25,
      },
    },
  });

  // Enterprise Plan
  await prisma.subscriptionPlan.upsert({
    where: { slug: "enterprise" },
    create: {
      name: "Enterprise",
      slug: "enterprise",
      description: "For large organizations with unlimited scale and premium support",
      price: 49900, // $499.00 in cents
      annualPrice: 499000, // $4990/year (2 months free)
      currency: "USD",
      features: {
        analytics_enabled: true,
        api_access_enabled: true,
        custom_branding: true,
        priority_support: true,
        advanced_reporting: true,
        users: null, // unlimited
        vehicles: null,
        drivers: null,
        customers: null,
        orders_per_month: null,
        storage_gb: null,
        api_requests_per_day: null,
        ai_credits_per_month: null,
        webhooks_per_month: null,
      },
      sortOrder: 3,
      isActive: true,
      isFeatured: false,
    },
    update: {
      description: "For large organizations with unlimited scale and premium support",
      price: 49900,
      annualPrice: 499000,
      features: {
        analytics_enabled: true,
        api_access_enabled: true,
        custom_branding: true,
        priority_support: true,
        advanced_reporting: true,
        users: null,
        vehicles: null,
        drivers: null,
        customers: null,
        orders_per_month: null,
        storage_gb: null,
        api_requests_per_day: null,
        ai_credits_per_month: null,
        webhooks_per_month: null,
      },
    },
  });

  console.log("✅ Subscription plans seeded successfully");
}

main()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
