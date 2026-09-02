export interface CustomerNotificationPreferences {
  shipmentAssigned: boolean;
  shipmentDelayed: boolean;
  shipmentDelivered: boolean;
  shipmentFailed: boolean;
  shipmentEnRoute: boolean;
  shipmentInTransit: boolean;
  shipmentArrived: boolean;
  shipmentCancelled: boolean;
  invoiceCreated: boolean;
  invoiceOverdue: boolean;
  paymentReceived: boolean;
  documentsAvailable: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: CustomerNotificationPreferences = {
  shipmentAssigned: true,
  shipmentDelayed: true,
  shipmentDelivered: true,
  shipmentFailed: true,
  shipmentEnRoute: true,
  shipmentInTransit: true,
  shipmentArrived: true,
  shipmentCancelled: true,
  invoiceCreated: true,
  invoiceOverdue: true,
  paymentReceived: true,
  documentsAvailable: true,
};

export type NotificationPreferenceKey = keyof CustomerNotificationPreferences;

export function resolveNotificationPreferences(
  raw: unknown,
): CustomerNotificationPreferences {
  const base = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as NotificationPreferenceKey[]) {
    if (typeof obj[key] === "boolean") {
      base[key] = obj[key];
    }
  }
  return base;
}
