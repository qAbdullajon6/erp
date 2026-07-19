import type { PlanFeatures } from "@/lib/api/billing";

/// Human labels for the known plan-feature keys. Anything not listed falls back
/// to a title-cased version of the raw key, so a new backend feature still
/// renders legibly without a frontend change.
const FEATURE_LABELS: Record<string, string> = {
  users: "Team members",
  vehicles: "Vehicles",
  drivers: "Drivers",
  customers: "Customers",
  orders_per_month: "Orders / month",
  api_requests_per_day: "API requests / day",
  ai_credits_per_month: "AI credits / month",
  storage_gb: "Storage (GB)",
  webhooks_per_month: "Webhooks / month",
  integrations: "Integrations",
  reports: "Reports",
  custom_branding: "Custom branding",
  sso: "Single sign-on (SSO)",
  audit_retention_days: "Audit retention (days)",
};

export function featureLabel(key: string): string {
  return (
    FEATURE_LABELS[key] ??
    key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

/// Renders a feature value the way a plan card should read it:
/// null → "Unlimited", boolean → included/not, number → localized, array → list.
export function featureValueText(value: unknown): string {
  if (value === null) return "Unlimited";
  if (typeof value === "boolean") return value ? "Included" : "—";
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/// Feature keys that are boolean capabilities rather than numeric limits — used
/// to split a plan card into "limits" and "capabilities" sections.
export function isCapability(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function featureEntries(features: PlanFeatures): Array<[string, PlanFeatures[string]]> {
  return Object.entries(features);
}
