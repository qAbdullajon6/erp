export type DriverNotificationSeedKind =
  | 'assignment'
  | 'status'
  | 'message'
  | 'route'
  | 'conflict'
  | 'cancelled';

export interface DriverNotificationSeed {
  kind: DriverNotificationSeedKind;
  title: string;
  message: string;
  typeHint: string;
}

const TYPE_MAP: Array<{ match: RegExp; kind: DriverNotificationSeedKind }> = [
  { match: /assign|reassign|dispatch\.assigned/i, kind: 'assignment' },
  { match: /status|transition|delivered|en_route|pickup/i, kind: 'status' },
  { match: /message|chat|sms/i, kind: 'message' },
  { match: /route|eta|navigation/i, kind: 'route' },
  { match: /conflict|overlap|double.?book/i, kind: 'conflict' },
  { match: /cancel/i, kind: 'cancelled' },
];

export function mapEventTypeToNotificationSeed(
  type: string,
  fallbackTitle = 'Driver update',
): DriverNotificationSeed {
  for (const entry of TYPE_MAP) {
    if (entry.match.test(type)) {
      return {
        kind: entry.kind,
        title: fallbackTitle,
        message: type,
        typeHint: type,
      };
    }
  }
  return {
    kind: 'status',
    title: fallbackTitle,
    message: type,
    typeHint: type,
  };
}

export function isDriverRelevantNotificationType(type: string): boolean {
  if (type === 'DRIVER_NEW_ASSIGNMENT') return true;
  return TYPE_MAP.some((e) => e.match.test(type));
}
