export const portalOrderKeys = {
  all: ['portal', 'orders'] as const,
  lists: () => [...portalOrderKeys.all, 'list'] as const,
  list: (params: unknown = {}) => [...portalOrderKeys.lists(), params] as const,
  details: () => [...portalOrderKeys.all, 'detail'] as const,
  detail: (id: string) => [...portalOrderKeys.details(), id] as const,
};

export const portalInvoiceKeys = {
  all: ['portal', 'invoices'] as const,
  lists: () => [...portalInvoiceKeys.all, 'list'] as const,
  list: (params: unknown = {}) => [...portalInvoiceKeys.lists(), params] as const,
  details: () => [...portalInvoiceKeys.all, 'detail'] as const,
  detail: (id: string) => [...portalInvoiceKeys.details(), id] as const,
};

export const portalDashboardKeys = {
  all: ['portal', 'dashboard'] as const,
  data: () => [...portalDashboardKeys.all, 'data'] as const,
};

export const portalNotificationKeys = {
  all: ['portal', 'notifications'] as const,
  list: (params: unknown = {}) => [...portalNotificationKeys.all, 'list', params] as const,
  unreadCount: () => [...portalNotificationKeys.all, 'unread-count'] as const,
};

export const portalDocumentKeys = {
  all: ['portal', 'documents'] as const,
  list: () => [...portalDocumentKeys.all, 'list'] as const,
};

export const portalProfileKeys = {
  all: ['portal', 'profile'] as const,
  data: () => [...portalProfileKeys.all, 'data'] as const,
};

export const portalAuthKeys = {
  currentCustomer: () => ['portal', 'auth', 'me'] as const,
};
