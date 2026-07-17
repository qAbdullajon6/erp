/// The ONE query-key factory for the operational domain (orders, dispatches,
/// availability) and the resources they assign.
///
/// Every key in the app is built here. Nothing may write a raw string key like
/// `['orders', id]` inline: two callers that spell the same key slightly
/// differently produce two independent caches, and then a mutation invalidates one
/// of them while a screen keeps reading the other. That is not a hypothetical —
/// it is exactly the class of bug this task exists to remove.
///
/// The keys are hierarchical, so `invalidateQueries({ queryKey: orderKeys.all })`
/// matches every order query — list and detail, whatever the params — while
/// `orderKeys.detail(id)` matches exactly one.

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (params: unknown = {}) => [...orderKeys.lists(), params] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
};

export const dispatchKeys = {
  all: ['dispatches'] as const,
  lists: () => [...dispatchKeys.all, 'list'] as const,
  list: (params: unknown = {}) => [...dispatchKeys.lists(), params] as const,
  details: () => [...dispatchKeys.all, 'detail'] as const,
  detail: (id: string) => [...dispatchKeys.details(), id] as const,
};

/// Availability is keyed by the WINDOW it was asked about. Two different trips ask
/// two different questions, and their answers must not share a cache entry.
export const availabilityKeys = {
  all: ['availability'] as const,
  window: (window?: { pickupDate?: string; deliveryDate?: string }) =>
    [...availabilityKeys.all, window ?? null] as const,
};

export const driverKeys = {
  all: ['drivers'] as const,
  lists: () => [...driverKeys.all, 'list'] as const,
  list: (params: unknown = {}) => [...driverKeys.lists(), params] as const,
  details: () => [...driverKeys.all, 'detail'] as const,
  detail: (id: string) => [...driverKeys.details(), id] as const,
};

export const vehicleKeys = {
  all: ['vehicles'] as const,
  lists: () => [...vehicleKeys.all, 'list'] as const,
  list: (params: unknown = {}) => [...vehicleKeys.lists(), params] as const,
  details: () => [...vehicleKeys.all, 'detail'] as const,
  detail: (id: string) => [...vehicleKeys.details(), id] as const,
};

export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (params: unknown = {}) => [...customerKeys.lists(), params] as const,
  details: () => [...customerKeys.all, 'detail'] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
};

/// The DRIVER's view of their own dispatches (Task 8.12). A separate root because it
/// is a different question — "what is on MY plate" — answered by a different
/// endpoint, even though it is a view of the same dispatches the board shows.
export const driverDispatchKeys = {
  all: ['my-dispatches'] as const,
  profile: () => [...driverDispatchKeys.all, 'profile'] as const,
  lists: () => [...driverDispatchKeys.all, 'list'] as const,
  detail: (id: string) => [...driverDispatchKeys.all, 'detail', id] as const,
};

export const deliveryProofKeys = {
  all: ['delivery-proofs'] as const,
  list: (dispatchId: string) => [...deliveryProofKeys.all, 'list', dispatchId] as const,
  detail: (dispatchId: string, proofId: string) =>
    [...deliveryProofKeys.all, 'detail', dispatchId, proofId] as const,
};

export const auditLogKeys = {
  all: ['audit-logs'] as const,
  lists: () => [...auditLogKeys.all, 'list'] as const,
  list: (params: unknown = {}) => [...auditLogKeys.lists(), params] as const,
  details: () => [...auditLogKeys.all, 'detail'] as const,
  detail: (id: string) => [...auditLogKeys.details(), id] as const,
};

export const importKeys = {
  all: ['imports'] as const,
  lists: () => [...importKeys.all, 'list'] as const,
  list: (params: unknown = {}) => [...importKeys.lists(), params] as const,
  details: () => [...importKeys.all, 'detail'] as const,
  detail: (id: string) => [...importKeys.details(), id] as const,
};

/// The dispatch/board summary — unassigned orders plus who's free/busy, board-
/// shaped for the Operations Center's alert cards and capacity strip. It carries
/// the same "who is free" fact as `availabilityKeys`, just summarized instead of
/// windowed, so it goes stale on exactly the same operational writes.
export const dispatchBoardKeys = {
  all: ['dispatch-board'] as const,
};

export const dashboardKeys = {
  all: ['dashboard'] as const,
  kpis: (params: unknown = {}) => [...dashboardKeys.all, 'kpis', params] as const,
  revenue: (params: unknown = {}) => [...dashboardKeys.all, 'revenue', params] as const,
  operations: (params: unknown = {}) => [...dashboardKeys.all, 'operations', params] as const,
  customers: (params: unknown = {}) => [...dashboardKeys.all, 'customers', params] as const,
  drivers: (params: unknown = {}) => [...dashboardKeys.all, 'drivers', params] as const,
  vehicles: (params: unknown = {}) => [...dashboardKeys.all, 'vehicles', params] as const,
  finance: (params: unknown = {}) => [...dashboardKeys.all, 'finance', params] as const,
  insights: (params: unknown = {}) => [...dashboardKeys.all, 'insights', params] as const,
  full: (params: unknown = {}) => [...dashboardKeys.all, 'full', params] as const,
  export: (params: unknown = {}) => [...dashboardKeys.all, 'export', params] as const,
};

/// Finance summary — distinct from dashboard finance (which is scoped to the
/// dashboard's date range), this is the standalone /api/finance/summary endpoint.
export const financeSummaryKeys = {
  all: ['finance-summary'] as const,
};

export const workflowKeys = {
  all: ['workflows'] as const,
  lists: () => [...workflowKeys.all, 'list'] as const,
  list: (params: unknown = {}) => [...workflowKeys.lists(), params] as const,
  details: () => [...workflowKeys.all, 'detail'] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
  triggers: () => [...workflowKeys.all, 'triggers'] as const,
  actions: () => [...workflowKeys.all, 'actions'] as const,
  executions: (id: string) => [...workflowKeys.detail(id), 'executions'] as const,
  execution: (id: string, executionId: string) => [...workflowKeys.executions(id), executionId] as const,
};
