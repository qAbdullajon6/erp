import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Response } from "express";
import Redis from "ioredis";

/// The realtime fan-out for telematics via Server-Sent Events (SSE).
///
/// Two responsibilities, deliberately in one place so ingestion has a single
/// thing to call:
///   1. a registry of connected SSE clients (Express Response objects), each
///      pinned to the organization it authenticated as;
///   2. `publish`, which delivers an event to every client of that org.
///
/// Horizontal scale is via Redis pub/sub. A position ingested on instance A
/// must reach a dispatcher whose SSE connection is on instance B, so when
/// REDIS_URL is set `publish` writes to a channel that EVERY instance (A
/// included) subscribes to, and the fan-out to local clients happens on
/// receipt. Without Redis — single instance, dev — `publish` fans out directly.
/// Either way a caller just calls `publish`; the topology is this service's
/// concern.
///
/// Tenant isolation is structural: a response is bound to one organizationId at
/// registration (from its JWT), and fan-out only ever visits responses whose
/// bound org equals the event's org. There is no client-supplied org anywhere
/// in the path, so one tenant can never receive another's positions.
///
/// SSE rather than WebSockets: this is one-directional server-push over plain
/// HTTP, so it needs no second protocol, no separate auth handshake, and no
/// sticky-session config at the load balancer. The realtime architecture is
/// shared with the AI Copilot module.

export type TelematicsEventType = "position" | "state" | "alert" | "geofence" | "trip";

export interface TelematicsRealtimeEvent {
  type: TelematicsEventType;
  vehicleId?: string | null;
  payload: Record<string, unknown>;
  at: string;
}

interface ClientContext {
  organizationId: string;
  /// Optional vehicle filter: a client watching one vehicle's detail view only
  /// wants that vehicle's stream.
  vehicleIds?: Set<string>;
}

interface Envelope {
  organizationId: string;
  event: TelematicsRealtimeEvent;
}

const CHANNEL = "telematics:events";

@Injectable()
export class TelematicsRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelematicsRealtimeService.name);
  private readonly clients = new Map<Response, ClientContext>();
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;

  onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log("No REDIS_URL — telematics realtime runs single-instance (in-process fan-out)");
      return;
    }
    try {
      this.publisher = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: null });
      this.subscriber = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: null });
      this.publisher.on("error", (err) => this.logger.error(`Redis publisher error: ${err.message}`));
      this.subscriber.on("error", (err) => this.logger.error(`Redis subscriber error: ${err.message}`));
      void this.subscriber.subscribe(CHANNEL).then(() => {
        this.logger.log("Telematics realtime subscribed to Redis channel for cross-instance fan-out");
      });
      this.subscriber.on("message", (_channel, message) => {
        try {
          const envelope = JSON.parse(message) as Envelope;
          this.fanOutLocal(envelope);
        } catch (err) {
          this.logger.warn(`Dropped malformed realtime message: ${err instanceof Error ? err.message : err}`);
        }
      });
    } catch (err) {
      this.logger.error(`Failed to init Redis for realtime, falling back to in-process: ${err instanceof Error ? err.message : err}`);
      this.publisher = null;
      this.subscriber = null;
    }
  }

  async onModuleDestroy() {
    await this.publisher?.quit().catch(() => undefined);
    await this.subscriber?.quit().catch(() => undefined);
  }

  registerClient(res: Response, context: ClientContext): void {
    this.clients.set(res, context);
  }

  removeClient(res: Response): void {
    this.clients.delete(res);
  }

  clientCount(): number {
    return this.clients.size;
  }

  /// Publishes an event to every socket of the given organization, across all
  /// instances when Redis is configured.
  publish(organizationId: string, event: TelematicsRealtimeEvent): void {
    const envelope: Envelope = { organizationId, event };
    if (this.publisher) {
      // Redis delivers back to this instance too, so we do NOT also fan out
      // locally here — that would double-send to local clients.
      this.publisher.publish(CHANNEL, JSON.stringify(envelope)).catch((err) => {
        this.logger.error(`Failed to publish realtime event: ${err instanceof Error ? err.message : err}`);
      });
      return;
    }
    this.fanOutLocal(envelope);
  }

  private fanOutLocal(envelope: Envelope): void {
    const sseData = `data: ${JSON.stringify(envelope.event)}\n\n`;
    for (const [res, ctx] of this.clients) {
      if (ctx.organizationId !== envelope.organizationId) continue;
      if (
        envelope.event.vehicleId &&
        ctx.vehicleIds &&
        ctx.vehicleIds.size > 0 &&
        !ctx.vehicleIds.has(envelope.event.vehicleId)
      ) {
        continue;
      }
      // Check if the response is still writable (client hasn't disconnected)
      if (!res.writableEnded) {
        try {
          res.write(sseData);
        } catch (err) {
          this.logger.warn(`Failed to send to a client, dropping it: ${err instanceof Error ? err.message : err}`);
          this.clients.delete(res);
        }
      } else {
        // Client disconnected, remove from registry
        this.clients.delete(res);
      }
    }
  }
}
