import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import Redis from "ioredis";
import type { TelematicsConfig } from "../../config/configuration";

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
  /// Per-organization active-connection tally, kept in lockstep with `clients`.
  /// The global count is `clients.size` itself (the Map is the single source of
  /// truth, so global admission can never desync or go negative). Per-org needs
  /// its own tally because the Map is keyed by Response, not by org.
  private readonly orgCounts = new Map<string, number>();
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  private get limits(): TelematicsConfig {
    return this.config.getOrThrow<TelematicsConfig>("telematics");
  }

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

  /// Admission-controlled registration. Returns false (and registers nothing)
  /// when admitting the client would exceed the global process ceiling or the
  /// caller's per-organization fairness limit. The caller MUST reject the
  /// request (HTTP 429) without opening an SSE stream when this returns false.
  ///
  /// Increment here is paired with the decrement in detach()/removeClient(); the
  /// two are the only paths that mutate the client registry, so the counters
  /// stay symmetric.
  tryRegisterClient(res: Response, context: ClientContext): boolean {
    // Global process-safety ceiling. `clients.size` is the authoritative global
    // count, so this check can never be fooled by a drifting counter.
    if (this.clients.size >= this.limits.sseMaxConnectionsGlobal) {
      return false;
    }
    // Per-organization fairness limit.
    const current = this.orgCounts.get(context.organizationId) ?? 0;
    if (current >= this.limits.sseMaxConnectionsPerOrg) {
      return false;
    }
    this.clients.set(res, context);
    this.orgCounts.set(context.organizationId, current + 1);
    return true;
  }

  removeClient(res: Response): void {
    this.detach(res);
  }

  clientCount(): number {
    return this.clients.size;
  }

  /// The single de-registration path: removes the client from the registry and
  /// decrements its org tally. Idempotent — a Response already gone is a no-op,
  /// so a double-remove (e.g. res 'close' racing a fan-out write failure) can
  /// never drive a counter negative. Every place that drops a client routes
  /// through here so the per-org tally can never leak or desync.
  private detach(res: Response): void {
    const context = this.clients.get(res);
    if (!context) return;
    this.clients.delete(res);
    const current = this.orgCounts.get(context.organizationId) ?? 0;
    const next = current - 1;
    if (next <= 0) {
      this.orgCounts.delete(context.organizationId);
    } else {
      this.orgCounts.set(context.organizationId, next);
    }
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
          this.detach(res);
        }
      } else {
        // Client disconnected, remove from registry
        this.detach(res);
      }
    }
  }
}
