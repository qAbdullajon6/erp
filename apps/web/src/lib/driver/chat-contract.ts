/**
 * Driver chat contract (frontend-only for P3.3.4).
 * Future realtime channel: `driver.chat.{orgId}.{driverId}` (WebSocket).
 */

export interface DriverChatThread {
  id: string;
  organizationId: string;
  driverId: string;
  dispatchId: string | null;
  subject: string;
  updatedAt: string;
  unreadCount: number;
}

export interface DriverChatMessage {
  id: string;
  threadId: string;
  senderUserId: string;
  senderRole: 'DRIVER' | 'DISPATCHER' | 'SYSTEM';
  body: string;
  createdAt: string;
  readAt: string | null;
}
