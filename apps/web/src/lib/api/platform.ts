import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse } from './error';
import { currentUserQueryKey } from './auth';
import { sessionManager } from './session';
import { leadKeys } from './leads';

const unwrap = unwrapResponse;
const BASE = '/api/platform';

// ── Shared ─────────────────────────────────────────────────────────

export interface PlatformPageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type SupportTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type FeatureFlagScope = 'ALL' | 'PLAN' | 'ORG';
export type PlatformNotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface PlatformAuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isPlatformAdmin: boolean;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    defaultCurrency?: string;
    timezone?: string;
  };
  membership: {
    id: string;
    role: string;
  };
  supportSession?: {
    id: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    startedAt: string;
  };
}

// ── Dashboard ──────────────────────────────────────────────────────

export interface PlatformDashboardSummary {
  kpis: {
    activeOrganizations: number;
    newOrganizationsThisMonth: number;
    openTickets: number;
    unreadNotifications: number;
    failedPayments: number;
    mrrCents: number;
  };
  attention: PlatformNotification[];
}

// ── Organizations ──────────────────────────────────────────────────

export interface PlatformOrganizationListItem {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  createdAt: string;
  memberCount: number;
  driverCount: number;
  vehicleCount: number;
  orderCount: number;
  plan: { id: string; name: string; slug: string } | null;
  subscriptionStatus: SubscriptionStatus | null;
  mrrCents: number;
}

export interface ListPlatformOrganizationsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrganizationStatus;
}

export interface ListPlatformOrganizationsResponse {
  items: PlatformOrganizationListItem[];
  meta: PlatformPageMeta;
}

export interface PlatformOrganizationDetail {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  defaultCurrency: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  counts: {
    memberships: number;
    drivers: number;
    vehicles: number;
    orders: number;
    customers: number;
  };
  subscription: {
    id: string;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    plan: {
      id: string;
      name: string;
      slug: string;
      price: number;
      currency: string;
      interval: string;
    };
  } | null;
  members: Array<{
    id: string;
    role: string;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      isPlatformAdmin: boolean;
    };
  }>;
  recentAudit: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    createdAt: string;
  }>;
}

// ── Search ─────────────────────────────────────────────────────────

export interface PlatformSearchResult {
  organizations: Array<{ id: string; name: string; slug: string; status: OrganizationStatus }>;
  drivers: Array<{
    id: string;
    name: string;
    email: string | null;
    status: string;
    organization: { id: string; name: string; status: OrganizationStatus };
  }>;
  vehicles: Array<{
    id: string;
    plateNumber: string;
    make: string | null;
    model: string | null;
    status: string;
    organization: { id: string; name: string; status: OrganizationStatus };
  }>;
  leads: Array<{
    id: string;
    name: string;
    email: string;
    company: string;
    status: string;
  }>;
}

// ── Analytics ──────────────────────────────────────────────────────

export interface PlatformAnalyticsOverview {
  revenue: {
    mrrCents: number;
    currency: string;
    activeSubscriptions: number;
  };
  growth: {
    newOrganizationsThisMonth: number;
    newOrganizationsPriorMonth: number;
  };
  churn: {
    cancellationsLast30Days: number;
  };
  usage: {
    topCustomers: Array<{
      organizationId: string;
      organizationName: string;
      status: OrganizationStatus | null;
      usageQuantity: number;
    }>;
  };
  activeOrganizations: number;
  planMix: Array<{ plan: string; count: number }>;
}

// ── Subscriptions ──────────────────────────────────────────────────

export interface PlatformSubscription {
  id: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  organizationId: string;
  planId: string;
  createdAt: string;
  updatedAt: string;
  plan: {
    id: string;
    name: string;
    slug: string;
    price: number;
    currency: string;
    interval: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    status: OrganizationStatus;
  };
}

export interface ListPlatformSubscriptionsParams {
  page?: number;
  limit?: number;
  status?: SubscriptionStatus;
}

export interface ListPlatformSubscriptionsResponse {
  items: PlatformSubscription[];
  meta: PlatformPageMeta;
}

// ── Notifications ──────────────────────────────────────────────────

export interface PlatformNotification {
  id: string;
  type: string;
  severity: PlatformNotificationSeverity;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface PlatformNotificationsList {
  items: PlatformNotification[];
  unreadCount: number;
}

// ── Support ────────────────────────────────────────────────────────

export interface PlatformSupportTicket {
  id: string;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  organizationId: string | null;
  assigneeUserId: string | null;
  createdById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    status: OrganizationStatus;
  } | null;
  assignee?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  createdBy?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface ListSupportTicketsParams {
  page?: number;
  limit?: number;
  status?: SupportTicketStatus;
  search?: string;
}

export interface ListSupportTicketsResponse {
  items: PlatformSupportTicket[];
  meta: PlatformPageMeta;
}

export interface CreateSupportTicketInput {
  organizationId?: string;
  subject: string;
  body: string;
  priority?: SupportTicketPriority;
}

export interface UpdateSupportTicketInput {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  assigneeUserId?: string | null;
}

// ── Audit ──────────────────────────────────────────────────────────

export interface PlatformAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  organizationId: string | null;
  actorUserId: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  actor: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface ListPlatformAuditParams {
  page?: number;
  limit?: number;
  action?: string;
  organizationId?: string;
}

export interface ListPlatformAuditResponse {
  items: PlatformAuditLog[];
  meta: PlatformPageMeta;
}

// ── System ─────────────────────────────────────────────────────────

export interface PlatformHealth {
  status: string;
  database: 'up' | 'down';
  redis: string;
  version: string;
  commit: string;
  uptimeSeconds: number;
  checkedAt: string;
  latencyMs: number;
}

export interface PlatformWorkers {
  items: Array<{ name: string; status: string; detail: string }>;
}

export interface PlatformQueues {
  items: Array<{ name: string; pending: number; failed: number; sent: number }>;
}

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabledGlobal: boolean;
  scope: FeatureFlagScope;
  createdAt: string;
  updatedAt: string;
  overrides?: Array<{
    id: string;
    enabled: boolean;
    planId: string | null;
    organizationId: string | null;
    plan?: { id: string; name: string; slug: string } | null;
    organization?: { id: string; name: string; slug: string } | null;
  }>;
}

export interface CreateFeatureFlagInput {
  key: string;
  name: string;
  description?: string;
  enabledGlobal?: boolean;
  scope?: FeatureFlagScope;
}

export interface UpdateFeatureFlagInput {
  name?: string;
  description?: string;
  enabledGlobal?: boolean;
  scope?: FeatureFlagScope;
}

// ── Settings ───────────────────────────────────────────────────────

export interface PlatformStaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  createdAt?: string;
  isPlatformAdmin?: boolean;
}

// ── Leads convert ──────────────────────────────────────────────────

export interface ConvertLeadResult {
  organization: { id: string; name: string; slug: string };
  adminUser: { id: string; email: string; firstName: string; lastName: string };
  provisionalPassword: string;
}

// ── API class ──────────────────────────────────────────────────────

function buildQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const q = search.toString();
  return q ? `?${q}` : '';
}

class PlatformAPI {
  async dashboard(): Promise<PlatformDashboardSummary> {
    const res = await apiFetch(`${BASE}/dashboard`, { method: 'GET' });
    return unwrap(res, 'Failed to load platform dashboard');
  }

  async listOrganizations(params: ListPlatformOrganizationsParams = {}): Promise<ListPlatformOrganizationsResponse> {
    const res = await apiFetch(
      `${BASE}/organizations${buildQuery({ ...params })}`,
      { method: 'GET' },
    );
    return unwrap(res, 'Failed to load organizations');
  }

  async getOrganization(id: string): Promise<PlatformOrganizationDetail> {
    const res = await apiFetch(`${BASE}/organizations/${id}`, { method: 'GET' });
    return unwrap(res, 'Failed to load organization');
  }

  async updateOrganizationStatus(id: string, status: OrganizationStatus) {
    const res = await apiFetch(`${BASE}/organizations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return unwrap(res, 'Failed to update organization status');
  }

  async enterOrganization(id: string): Promise<PlatformAuthTokens> {
    const res = await apiFetch(`${BASE}/organizations/${id}/enter`, { method: 'POST' });
    return unwrap(res, 'Failed to enter organization');
  }

  async exitSupport(): Promise<PlatformAuthTokens> {
    const res = await apiFetch(`${BASE}/organizations/support/exit`, { method: 'POST' });
    return unwrap(res, 'Failed to exit support session');
  }

  async search(q: string): Promise<PlatformSearchResult> {
    const res = await apiFetch(`${BASE}/search${buildQuery({ q })}`, { method: 'GET' });
    return unwrap(res, 'Failed to search');
  }

  async analytics(): Promise<PlatformAnalyticsOverview> {
    const res = await apiFetch(`${BASE}/analytics`, { method: 'GET' });
    return unwrap(res, 'Failed to load analytics');
  }

  async listSubscriptions(params: ListPlatformSubscriptionsParams = {}): Promise<ListPlatformSubscriptionsResponse> {
    const res = await apiFetch(`${BASE}/subscriptions${buildQuery({ ...params })}`, { method: 'GET' });
    return unwrap(res, 'Failed to load subscriptions');
  }

  async updateSubscriptionStatus(id: string, status: SubscriptionStatus) {
    const res = await apiFetch(`${BASE}/subscriptions/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return unwrap(res, 'Failed to update subscription');
  }

  async listNotifications(): Promise<PlatformNotificationsList> {
    const res = await apiFetch(`${BASE}/notifications`, { method: 'GET' });
    return unwrap(res, 'Failed to load notifications');
  }

  async markNotificationRead(id: string) {
    const res = await apiFetch(`${BASE}/notifications/${id}/read`, { method: 'PATCH' });
    return unwrap(res, 'Failed to mark notification read');
  }

  async markAllNotificationsRead() {
    const res = await apiFetch(`${BASE}/notifications/read-all`, { method: 'POST' });
    return unwrap<{ updated: number }>(res, 'Failed to mark all notifications read');
  }

  async listSupportTickets(params: ListSupportTicketsParams = {}): Promise<ListSupportTicketsResponse> {
    const res = await apiFetch(`${BASE}/support${buildQuery({ ...params })}`, { method: 'GET' });
    return unwrap(res, 'Failed to load support tickets');
  }

  async getSupportTicket(id: string): Promise<PlatformSupportTicket> {
    const res = await apiFetch(`${BASE}/support/${id}`, { method: 'GET' });
    return unwrap(res, 'Failed to load support ticket');
  }

  async createSupportTicket(input: CreateSupportTicketInput): Promise<PlatformSupportTicket> {
    const res = await apiFetch(`${BASE}/support`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrap(res, 'Failed to create support ticket');
  }

  async updateSupportTicket(id: string, input: UpdateSupportTicketInput): Promise<PlatformSupportTicket> {
    const res = await apiFetch(`${BASE}/support/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return unwrap(res, 'Failed to update support ticket');
  }

  async listAudit(params: ListPlatformAuditParams = {}): Promise<ListPlatformAuditResponse> {
    const res = await apiFetch(`${BASE}/audit${buildQuery({ ...params })}`, { method: 'GET' });
    return unwrap(res, 'Failed to load audit log');
  }

  async health(): Promise<PlatformHealth> {
    const res = await apiFetch(`${BASE}/system/health`, { method: 'GET' });
    return unwrap(res, 'Failed to load system health');
  }

  async workers(): Promise<PlatformWorkers> {
    const res = await apiFetch(`${BASE}/system/workers`, { method: 'GET' });
    return unwrap(res, 'Failed to load workers');
  }

  async queues(): Promise<PlatformQueues> {
    const res = await apiFetch(`${BASE}/system/queues`, { method: 'GET' });
    return unwrap(res, 'Failed to load queues');
  }

  async listFeatureFlags(): Promise<FeatureFlag[]> {
    const res = await apiFetch(`${BASE}/system/feature-flags`, { method: 'GET' });
    return unwrap(res, 'Failed to load feature flags');
  }

  async createFeatureFlag(input: CreateFeatureFlagInput): Promise<FeatureFlag> {
    const res = await apiFetch(`${BASE}/system/feature-flags`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrap(res, 'Failed to create feature flag');
  }

  async updateFeatureFlag(id: string, input: UpdateFeatureFlagInput): Promise<FeatureFlag> {
    const res = await apiFetch(`${BASE}/system/feature-flags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return unwrap(res, 'Failed to update feature flag');
  }

  async listStaff(): Promise<PlatformStaffUser[]> {
    const res = await apiFetch(`${BASE}/settings/staff`, { method: 'GET' });
    return unwrap(res, 'Failed to load staff');
  }

  async lookupStaff(email: string): Promise<PlatformStaffUser> {
    const res = await apiFetch(`${BASE}/settings/staff/lookup${buildQuery({ email })}`, { method: 'GET' });
    return unwrap(res, 'Failed to look up user');
  }

  async setPlatformAdmin(userId: string, isPlatformAdmin: boolean): Promise<PlatformStaffUser> {
    const res = await apiFetch(`${BASE}/settings/staff`, {
      method: 'PATCH',
      body: JSON.stringify({ userId, isPlatformAdmin }),
    });
    return unwrap(res, 'Failed to update platform admin');
  }

  async convertLead(id: string): Promise<ConvertLeadResult> {
    const res = await apiFetch(`${BASE}/leads/${id}/convert`, { method: 'POST' });
    return unwrap(res, 'Failed to convert lead');
  }
}

export const platformAPI = new PlatformAPI();

// ── Query keys ─────────────────────────────────────────────────────

export const platformKeys = {
  all: ['platform'] as const,
  dashboard: () => [...platformKeys.all, 'dashboard'] as const,
  organizations: (params: ListPlatformOrganizationsParams = {}) =>
    [...platformKeys.all, 'organizations', params] as const,
  organization: (id: string) => [...platformKeys.all, 'organization', id] as const,
  search: (q: string) => [...platformKeys.all, 'search', q] as const,
  analytics: () => [...platformKeys.all, 'analytics'] as const,
  subscriptions: (params: ListPlatformSubscriptionsParams = {}) =>
    [...platformKeys.all, 'subscriptions', params] as const,
  notifications: () => [...platformKeys.all, 'notifications'] as const,
  support: (params: ListSupportTicketsParams = {}) => [...platformKeys.all, 'support', params] as const,
  supportTicket: (id: string) => [...platformKeys.all, 'support-ticket', id] as const,
  audit: (params: ListPlatformAuditParams = {}) => [...platformKeys.all, 'audit', params] as const,
  health: () => [...platformKeys.all, 'health'] as const,
  workers: () => [...platformKeys.all, 'workers'] as const,
  queues: () => [...platformKeys.all, 'queues'] as const,
  featureFlags: () => [...platformKeys.all, 'feature-flags'] as const,
  staff: () => [...platformKeys.all, 'staff'] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────

export function usePlatformDashboardQuery(enabled = true) {
  return useQuery({
    queryKey: platformKeys.dashboard(),
    queryFn: () => platformAPI.dashboard(),
    enabled,
  });
}

export function usePlatformOrganizationsQuery(params: ListPlatformOrganizationsParams = {}, enabled = true) {
  return useQuery({
    queryKey: platformKeys.organizations(params),
    queryFn: () => platformAPI.listOrganizations(params),
    enabled,
  });
}

export function usePlatformOrganizationQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: platformKeys.organization(id),
    queryFn: () => platformAPI.getOrganization(id),
    enabled: enabled && !!id,
  });
}

export function usePlatformSearchQuery(q: string, enabled = true) {
  return useQuery({
    queryKey: platformKeys.search(q),
    queryFn: () => platformAPI.search(q),
    enabled: enabled && q.trim().length >= 2,
  });
}

export function usePlatformAnalyticsQuery(enabled = true) {
  return useQuery({
    queryKey: platformKeys.analytics(),
    queryFn: () => platformAPI.analytics(),
    enabled,
  });
}

export function usePlatformSubscriptionsQuery(params: ListPlatformSubscriptionsParams = {}, enabled = true) {
  return useQuery({
    queryKey: platformKeys.subscriptions(params),
    queryFn: () => platformAPI.listSubscriptions(params),
    enabled,
  });
}

export function usePlatformNotificationsQuery(enabled = true) {
  return useQuery({
    queryKey: platformKeys.notifications(),
    queryFn: () => platformAPI.listNotifications(),
    enabled,
    refetchInterval: 30_000,
  });
}

export function usePlatformSupportTicketsQuery(params: ListSupportTicketsParams = {}, enabled = true) {
  return useQuery({
    queryKey: platformKeys.support(params),
    queryFn: () => platformAPI.listSupportTickets(params),
    enabled,
  });
}

export function usePlatformSupportTicketQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: platformKeys.supportTicket(id),
    queryFn: () => platformAPI.getSupportTicket(id),
    enabled: enabled && !!id,
  });
}

export function usePlatformAuditQuery(params: ListPlatformAuditParams = {}, enabled = true) {
  return useQuery({
    queryKey: platformKeys.audit(params),
    queryFn: () => platformAPI.listAudit(params),
    enabled,
  });
}

export function usePlatformHealthQuery(enabled = true) {
  return useQuery({
    queryKey: platformKeys.health(),
    queryFn: () => platformAPI.health(),
    enabled,
  });
}

export function usePlatformWorkersQuery(enabled = true) {
  return useQuery({
    queryKey: platformKeys.workers(),
    queryFn: () => platformAPI.workers(),
    enabled,
  });
}

export function usePlatformQueuesQuery(enabled = true) {
  return useQuery({
    queryKey: platformKeys.queues(),
    queryFn: () => platformAPI.queues(),
    enabled,
  });
}

export function usePlatformFeatureFlagsQuery(enabled = true) {
  return useQuery({
    queryKey: platformKeys.featureFlags(),
    queryFn: () => platformAPI.listFeatureFlags(),
    enabled,
  });
}

export function usePlatformStaffQuery(enabled = true) {
  return useQuery({
    queryKey: platformKeys.staff(),
    queryFn: () => platformAPI.listStaff(),
    enabled,
  });
}

function applyAuthTokens(tokens: PlatformAuthTokens) {
  sessionManager.setTokens(tokens.accessToken, tokens.refreshToken);
}

export function useEnterOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformAPI.enterOrganization(id),
    onSuccess: async (tokens) => {
      applyAuthTokens(tokens);
      await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
    },
  });
}

export function useExitSupportMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => platformAPI.exitSupport(),
    onSuccess: async (tokens) => {
      applyAuthTokens(tokens);
      await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
    },
  });
}

export function useUpdateOrganizationStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrganizationStatus }) =>
      platformAPI.updateOrganizationStatus(id, status),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.all });
      void queryClient.invalidateQueries({ queryKey: platformKeys.organization(vars.id) });
    },
  });
}

export function useUpdateSubscriptionStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SubscriptionStatus }) =>
      platformAPI.updateSubscriptionStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformKeys.all }),
  });
}

export function useMarkPlatformNotificationReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformAPI.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformKeys.notifications() }),
  });
}

export function useMarkAllPlatformNotificationsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => platformAPI.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformKeys.notifications() }),
  });
}

export function useCreateSupportTicketMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupportTicketInput) => platformAPI.createSupportTicket(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformKeys.all }),
  });
}

export function useUpdateSupportTicketMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSupportTicketInput }) =>
      platformAPI.updateSupportTicket(id, input),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.all });
      void queryClient.invalidateQueries({ queryKey: platformKeys.supportTicket(vars.id) });
    },
  });
}

export function useCreateFeatureFlagMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFeatureFlagInput) => platformAPI.createFeatureFlag(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformKeys.featureFlags() }),
  });
}

export function useUpdateFeatureFlagMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFeatureFlagInput }) =>
      platformAPI.updateFeatureFlag(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformKeys.featureFlags() }),
  });
}

export function useSetPlatformAdminMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, isPlatformAdmin }: { userId: string; isPlatformAdmin: boolean }) =>
      platformAPI.setPlatformAdmin(userId, isPlatformAdmin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformKeys.staff() }),
  });
}

export function useConvertLeadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformAPI.convertLead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leadKeys.all });
      void queryClient.invalidateQueries({ queryKey: platformKeys.all });
    },
  });
}
