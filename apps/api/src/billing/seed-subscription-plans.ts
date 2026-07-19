import { PrismaClient } from "@prisma/client";

/// Subscription plan seeder - creates/updates default plans.
///
/// Run with: npx ts-node -r tsconfig-paths/register src/billing/seed-subscription-plans.ts
///
/// Idempotent: safe to run multiple times (upserts by slug)
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
        analyticsEnabled: true,
        apiAccessEnabled: false,
        customBrandingEnabled: false,
        prioritySupportEnabled: false,
        advancedReportingEnabled: false,

        // Numeric limits (null = unlimited)
        maxUsers: 3,
        maxVehicles: 5,
        maxDrivers: 5,
        maxCustomers: 25,
        maxOrders: 50, // per month
        maxStorageGB: 1,
        maxApiRequests: 100, // per month
        maxAiCredits: 10, // per month
        maxWebhooks: 0, // no webhooks on free plan
      },
      sortOrder: 0,
      isActive: true,
      isFeatured: false,
    },
    update: {
      description: "Perfect for trying out FlowERP",
      features: {
        analyticsEnabled: true,
        apiAccessEnabled: false,
        customBrandingEnabled: false,
        prioritySupportEnabled: false,
        advancedReportingEnabled: false,
        maxUsers: 3,
        maxVehicles: 5,
        maxDrivers: 5,
        maxCustomers: 25,
        maxOrders: 50,
        maxStorageGB: 1,
        maxApiRequests: 100,
        maxAiCredits: 10,
        maxWebhooks: 0,
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
        analyticsEnabled: true,
        apiAccessEnabled: true,
        customBrandingEnabled: false,
        prioritySupportEnabled: false,
        advancedReportingEnabled: false,
        maxUsers: 10,
        maxVehicles: 20,
        maxDrivers: 20,
        maxCustomers: 100,
        maxOrders: 500,
        maxStorageGB: 10,
        maxApiRequests: 10000,
        maxAiCredits: 100,
        maxWebhooks: 5,
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
        analyticsEnabled: true,
        apiAccessEnabled: true,
        customBrandingEnabled: false,
        prioritySupportEnabled: false,
        advancedReportingEnabled: false,
        maxUsers: 10,
        maxVehicles: 20,
        maxDrivers: 20,
        maxCustomers: 100,
        maxOrders: 500,
        maxStorageGB: 10,
        maxApiRequests: 10000,
        maxAiCredits: 100,
        maxWebhooks: 5,
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
        analyticsEnabled: true,
        apiAccessEnabled: true,
        customBrandingEnabled: true,
        prioritySupportEnabled: true,
        advancedReportingEnabled: true,
        maxUsers: 50,
        maxVehicles: 100,
        maxDrivers: 100,
        maxCustomers: 1000,
        maxOrders: 5000,
        maxStorageGB: 100,
        maxApiRequests: 100000,
        maxAiCredits: 1000,
        maxWebhooks: 25,
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
        analyticsEnabled: true,
        apiAccessEnabled: true,
        customBrandingEnabled: true,
        prioritySupportEnabled: true,
        advancedReportingEnabled: true,
        maxUsers: 50,
        maxVehicles: 100,
        maxDrivers: 100,
        maxCustomers: 1000,
        maxOrders: 5000,
        maxStorageGB: 100,
        maxApiRequests: 100000,
        maxAiCredits: 1000,
        maxWebhooks: 25,
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
        analyticsEnabled: true,
        apiAccessEnabled: true,
        customBrandingEnabled: true,
        prioritySupportEnabled: true,
        advancedReportingEnabled: true,
        maxUsers: null, // unlimited
        maxVehicles: null,
        maxDrivers: null,
        maxCustomers: null,
        maxOrders: null,
        maxStorageGB: null,
        maxApiRequests: null,
        maxAiCredits: null,
        maxWebhooks: null,
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
        analyticsEnabled: true,
        apiAccessEnabled: true,
        customBrandingEnabled: true,
        prioritySupportEnabled: true,
        advancedReportingEnabled: true,
        maxUsers: null,
        maxVehicles: null,
        maxDrivers: null,
        maxCustomers: null,
        maxOrders: null,
        maxStorageGB: null,
        maxApiRequests: null,
        maxAiCredits: null,
        maxWebhooks: null,
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
