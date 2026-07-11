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

/// The DRIVER's view of their own dispatches (Task 8.12). A separate root because it
/// is a different question — "what is on MY plate" — answered by a different
/// endpoint, even though it is a view of the same dispatches the board shows.
export const driverDispatchKeys = {
  all: ['my-dispatches'] as const,
  profile: () => [...driverDispatchKeys.all, 'profile'] as const,
  lists: () => [...driverDispatchKeys.all, 'list'] as const,
  detail: (id: string) => [...driverDispatchKeys.all, 'detail', id] as const,
};
