import { apiFetch } from "./fetch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, unwrapResponse as unwrap } from "./error";

// ── Types (mirror the API's billing response shapes) ───────────────

export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "EXPIRED" | "CANCELLED";

/// Plan `features` is an open JSON map: number = a numeric limit, null =
/// unlimited, boolean = a feature flag, array = an allowed-value list.
export type PlanFeatures = Record<string, number | boolean | string[] | null>;

export interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /// Monthly price in minor units (cents). Divide by 100 for display.
  price: number;
  annualPrice: number | null;
  currency: string;
  features: PlanFeatures;
  isActive?: boolean;
  isFeatured: boolean;
  sortOrder?: number;
}

export interface Subscription {
  id: string;
  organizationId: string;
  plan: { id: string; name: string; slug: string; price: number; currency: string };
  status: SubscriptionStatus;
  seats: number | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  cancelAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  autoRenew: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MetricUsage {
  metricType: string;
  label: string;
  currentUsage: number;
  limit: number | null;
  unit: string;
  percentageUsed: number;
  isUnlimited: boolean;
}

export interface UsageSummary {
  periodStart: string;
  periodEnd: string;
  metrics: MetricUsage[];
}

export interface SeatSummary {
  used: number;
  available: number | null;
  percentageUsed: number;
  isUnlimited: boolean;
}

export interface SubscriptionHistoryEntry {
  id: string;
  eventType: string;
  fromPlan: { id: string; name: string } | null;
  toPlan: { id: string; name: string } | null;
  effectiveDate: string;
  reason: string | null;
  actor: { id: string; name: string; email: string } | null;
  createdAt: string;
}

export interface PlanComparison {
  planA: { id: string; name: string; slug: string };
  planB: { id: string; name: string; slug: string };
  differences: Array<{ feature: string; planAValue: unknown; planBValue: unknown }>;
}

export interface CreateSubscriptionInput {
  planId: string;
  trialDays?: number;
  seats?: number;
}

// ── API client ─────────────────────────────────────────────────────

class BillingAPI {
  private baseUrl = "/api";

  async listPlans(): Promise<Plan[]> {
    const res = await apiFetch(`${this.baseUrl}/plans/admin/all`, { method: "GET" });
    return (await unwrap<{ plans: Plan[] }>(res, "Failed to load plans")).plans;
  }

  /// Returns null (not an error) when the org has no subscription yet — the API
  /// answers that case with a 404, which is a legitimate empty state here, not
  /// a failure the UI should surface as red.
  async getSubscription(): Promise<Subscription | null> {
    const res = await apiFetch(`${this.baseUrl}/subscriptions`, { method: "GET" });
    if (res.status === 404) return null;
    return (await unwrap<{ subscription: Subscription }>(res, "Failed to load subscription")).subscription;
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    const res = await apiFetch(`${this.baseUrl}/subscriptions`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return (await unwrap<{ subscription: Subscription }>(res, "Failed to create subscription")).subscription;
  }

  async upgrade(newPlanId: string): Promise<Subscription> {
    const res = await apiFetch(`${this.baseUrl}/subscriptions/upgrade`, {
      method: "POST",
      body: JSON.stringify({ newPlanId }),
    });
    return (await unwrap<{ subscription: Subscription }>(res, "Failed to upgrade subscription")).subscription;
  }

  async downgrade(newPlanId: string, immediate: boolean): Promise<Subscription> {
    const res = await apiFetch(`${this.baseUrl}/subscriptions/downgrade`, {
      method: "POST",
      body: JSON.stringify({ newPlanId, immediate }),
    });
    return (await unwrap<{ subscription: Subscription }>(res, "Failed to downgrade subscription")).subscription;
  }

  async cancel(immediate: boolean, reason?: string): Promise<Subscription> {
    const res = await apiFetch(`${this.baseUrl}/subscriptions/cancel`, {
      method: "POST",
      body: JSON.stringify({ immediate, reason }),
    });
    return (await unwrap<{ subscription: Subscription }>(res, "Failed to cancel subscription")).subscription;
  }

  async reactivate(): Promise<Subscription> {
    const res = await apiFetch(`${this.baseUrl}/subscriptions/reactivate`, { method: "POST" });
    return (await unwrap<{ subscription: Subscription }>(res, "Failed to reactivate subscription")).subscription;
  }

  async addSeats(count: number): Promise<Subscription> {
    const res = await apiFetch(`${this.baseUrl}/subscriptions/seats`, {
      method: "POST",
      body: JSON.stringify({ count }),
    });
    return (await unwrap<{ subscription: Subscription }>(res, "Failed to add seats")).subscription;
  }

  async getUsage(): Promise<UsageSummary> {
    const res = await apiFetch(`${this.baseUrl}/subscriptions/usage`, { method: "GET" });
    return (await unwrap<{ usage: UsageSummary }>(res, "Failed to load usage")).usage;
  }

  async getSeats(): Promise<SeatSummary> {
    const res = await apiFetch(`${this.baseUrl}/subscriptions/seats`, { method: "GET" });
    return (await unwrap<{ seats: SeatSummary }>(res, "Failed to load seat summary")).seats;
  }

  async getHistory(): Promise<SubscriptionHistoryEntry[]> {
    const res = await apiFetch(`${this.baseUrl}/subscriptions/history`, { method: "GET" });
    return (await unwrap<{ history: SubscriptionHistoryEntry[] }>(res, "Failed to load history")).history;
  }

  async comparePlans(planId: string, otherId: string): Promise<PlanComparison> {
    const res = await apiFetch(`${this.baseUrl}/plans/${planId}/compare/${otherId}`, { method: "GET" });
    return (await unwrap<{ comparison: PlanComparison }>(res, "Failed to compare plans")).comparison;
  }
}

export const billingAPI = new BillingAPI();

// ── Query keys ─────────────────────────────────────────────────────

export const billingKeys = {
  all: ["billing"] as const,
  plans: () => [...billingKeys.all, "plans"] as const,
  subscription: () => [...billingKeys.all, "subscription"] as const,
  usage: () => [...billingKeys.all, "usage"] as const,
  seats: () => [...billingKeys.all, "seats"] as const,
  history: () => [...billingKeys.all, "history"] as const,
  comparison: (a: string, b: string) => [...billingKeys.all, "comparison", a, b] as const,
};

// ── Queries ────────────────────────────────────────────────────────

export function usePlansQuery() {
  return useQuery({ queryKey: billingKeys.plans(), queryFn: () => billingAPI.listPlans() });
}

export function useSubscriptionQuery() {
  return useQuery({ queryKey: billingKeys.subscription(), queryFn: () => billingAPI.getSubscription() });
}

export function useUsageQuery(enabled = true) {
  return useQuery({ queryKey: billingKeys.usage(), queryFn: () => billingAPI.getUsage(), enabled });
}

export function useSeatsQuery(enabled = true) {
  return useQuery({ queryKey: billingKeys.seats(), queryFn: () => billingAPI.getSeats(), enabled });
}

export function useHistoryQuery(enabled = true) {
  return useQuery({ queryKey: billingKeys.history(), queryFn: () => billingAPI.getHistory(), enabled });
}

export function usePlanComparisonQuery(planId: string | null, otherId: string | null) {
  return useQuery({
    queryKey: billingKeys.comparison(planId ?? "", otherId ?? ""),
    queryFn: () => billingAPI.comparePlans(planId!, otherId!),
    enabled: !!planId && !!otherId && planId !== otherId,
  });
}

// ── Mutations ──────────────────────────────────────────────────────

/// A subscription change moves plan, status, seats, quotas and history all at
/// once — so every billing mutation invalidates the whole billing root rather
/// than trying to enumerate which slices moved.
function useInvalidateBilling() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: billingKeys.all });
}

export function useCreateSubscriptionMutation() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (input: CreateSubscriptionInput) => billingAPI.createSubscription(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpgradeMutation() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (newPlanId: string) => billingAPI.upgrade(newPlanId),
    onSuccess: () => invalidate(),
  });
}

export function useDowngradeMutation() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({ newPlanId, immediate }: { newPlanId: string; immediate: boolean }) =>
      billingAPI.downgrade(newPlanId, immediate),
    onSuccess: () => invalidate(),
  });
}

export function useCancelMutation() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({ immediate, reason }: { immediate: boolean; reason?: string }) =>
      billingAPI.cancel(immediate, reason),
    onSuccess: () => invalidate(),
  });
}

export function useReactivateMutation() {
  const invalidate = useInvalidateBilling();
  return useMutation({ mutationFn: () => billingAPI.reactivate(), onSuccess: () => invalidate() });
}

export function useAddSeatsMutation() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (count: number) => billingAPI.addSeats(count),
    onSuccess: () => invalidate(),
  });
}

// ── Presentation helpers (shared across billing components) ─────────

/// Plans are priced in minor units; every money figure in the billing UI goes
/// through this so cents never leak to the screen.
export function planPriceMajor(price: number): number {
  return price / 100;
}

export function isNoSubscriptionError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
