import { apiFetch } from '@/services/api/client';
import { unwrapResponse } from '@/services/api/error';
import type { IngestPosition, TrackingHeartbeatResult, TrackingReceiveResult } from './tracking-types';

/**
 * The two endpoints a driver's phone actually uses (docs/DRIVER_MOBILE_GPS.md §2).
 * Everything else on `/tracking/*` (live, live-stream, history, sessions/open,
 * end) is ADMIN/OPERATIONS_MANAGER/DISPATCHER only — the phone has no business
 * calling them and doesn't. The vehicle is resolved server-side from the
 * driver's live dispatch; this client never names one.
 */
class TrackingAPI {
  async postMyLocation(positions: IngestPosition[]): Promise<TrackingReceiveResult> {
    const response = await apiFetch('/tracking/my-location', {
      method: 'POST',
      body: JSON.stringify({ positions }),
    });
    return unwrapResponse<TrackingReceiveResult>(response, 'Failed to post location');
  }

  /** Only useful once a session exists — the server 404s "send GPS first" if
   * this is called before any successful my-location post this session. */
  async postMyHeartbeat(): Promise<TrackingHeartbeatResult> {
    const response = await apiFetch('/tracking/my-heartbeat', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return unwrapResponse<TrackingHeartbeatResult>(response, 'Failed to send heartbeat');
  }
}

export const trackingAPI = new TrackingAPI();
