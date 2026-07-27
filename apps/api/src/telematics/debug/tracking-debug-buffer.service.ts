import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { IngestFilterReason } from "../ingestion/ingest-validation";

export type TrackingDebugPacketOutcome = "accepted" | "rejected";

export type TrackingDebugEventKind =
  | "driver_login"
  | "dispatch_assigned"
  | "session_created"
  | "gps_received"
  | "vehicle_updated"
  | "replay_saved"
  | "sse_broadcast"
  | "heartbeat"
  | "dispatch_finished"
  | "session_closed";

export interface TrackingDebugPacket {
  id: string;
  organizationId: string;
  vehicleId: string | null;
  driverId: string | null;
  deviceId: string | null;
  source: string;
  /// Server receive time (ISO).
  receivedAt: string;
  /// Device `recordedAt` (ISO) when present.
  deviceAt: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  heading: number | null;
  accuracyM: number | null;
  /// Wall-clock ms spent in ingest for this batch (shared across batch members).
  processingDurationMs: number;
  /// Optional measured SSE fan-out duration for the following broadcast.
  sseBroadcastDurationMs: number | null;
  /// Optional trip aggregate write duration when a trip was updated.
  replayWriteDurationMs: number | null;
  outcome: TrackingDebugPacketOutcome;
  reason: IngestFilterReason | "vehicle_not_found" | "empty_batch" | null;
  movementState: string | null;
  tripId: string | null;
  sessionId: string | null;
}

export interface TrackingDebugEvent {
  id: string;
  organizationId: string;
  kind: TrackingDebugEventKind;
  at: string;
  vehicleId: string | null;
  driverId: string | null;
  dispatchId: string | null;
  sessionId: string | null;
  tripId: string | null;
  message: string;
  meta?: Record<string, unknown>;
}

export interface TrackingDebugMetrics {
  windowStartedAt: string;
  packetsTotal: number;
  packetsAccepted: number;
  packetsRejected: number;
  packetsPerMinute: number;
  avgGpsIntervalMs: number | null;
  avgProcessingLatencyMs: number | null;
  avgSseBroadcastLatencyMs: number | null;
  avgReplayWriteLatencyMs: number | null;
  connectedDriversEstimate: number;
  activeSessions: number;
  sseClientsGlobal: number;
  sseClientsOrg: number;
}

const PACKET_CAPACITY = 500;
const EVENT_CAPACITY = 300;
const INTERVAL_SAMPLES = 200;
const LATENCY_SAMPLES = 200;

/// Process-local observability for Fleet Tracking Phase 11.
/// Never invents GPS — only stores what ingest / session / SSE actually did.
@Injectable()
export class TrackingDebugBufferService {
  private readonly packets: TrackingDebugPacket[] = [];
  private readonly events: TrackingDebugEvent[] = [];
  private readonly lastGpsAtByVehicle = new Map<string, number>();
  private readonly gpsIntervalsMs: number[] = [];
  private readonly processingLatenciesMs: number[] = [];
  private readonly sseLatenciesMs: number[] = [];
  private readonly replayLatenciesMs: number[] = [];
  private windowStartedAt = new Date().toISOString();
  private packetsTotal = 0;
  private packetsAccepted = 0;
  private packetsRejected = 0;

  recordPacket(input: Omit<TrackingDebugPacket, "id">): TrackingDebugPacket {
    const packet: TrackingDebugPacket = { id: randomUUID(), ...input };
    this.pushRing(this.packets, packet, PACKET_CAPACITY);
    this.packetsTotal += 1;
    if (packet.outcome === "accepted") {
      this.packetsAccepted += 1;
      this.pushSample(this.processingLatenciesMs, packet.processingDurationMs, LATENCY_SAMPLES);
      if (packet.sseBroadcastDurationMs != null) {
        this.pushSample(this.sseLatenciesMs, packet.sseBroadcastDurationMs, LATENCY_SAMPLES);
      }
      if (packet.replayWriteDurationMs != null) {
        this.pushSample(this.replayLatenciesMs, packet.replayWriteDurationMs, LATENCY_SAMPLES);
      }
      if (packet.vehicleId && packet.deviceAt) {
        const at = Date.parse(packet.deviceAt);
        if (Number.isFinite(at)) {
          const prev = this.lastGpsAtByVehicle.get(packet.vehicleId);
          if (prev != null && at > prev) {
            this.pushSample(this.gpsIntervalsMs, at - prev, INTERVAL_SAMPLES);
          }
          this.lastGpsAtByVehicle.set(packet.vehicleId, at);
        }
      }
    } else {
      this.packetsRejected += 1;
      this.pushSample(this.processingLatenciesMs, packet.processingDurationMs, LATENCY_SAMPLES);
    }
    return packet;
  }

  recordEvent(input: Omit<TrackingDebugEvent, "id">): TrackingDebugEvent {
    const event: TrackingDebugEvent = { id: randomUUID(), ...input };
    this.pushRing(this.events, event, EVENT_CAPACITY);
    return event;
  }

  listPackets(organizationId: string, limit = 100): TrackingDebugPacket[] {
    return this.packets
      .filter((p) => p.organizationId === organizationId)
      .slice(-Math.max(1, Math.min(limit, PACKET_CAPACITY)))
      .reverse();
  }

  listEvents(organizationId: string, limit = 100): TrackingDebugEvent[] {
    return this.events
      .filter((e) => e.organizationId === organizationId)
      .slice(-Math.max(1, Math.min(limit, EVENT_CAPACITY)))
      .reverse();
  }

  metricsSnapshot(args: {
    organizationId: string;
    activeSessions: number;
    connectedDriversEstimate: number;
    sseClientsGlobal: number;
    sseClientsOrg: number;
  }): TrackingDebugMetrics {
    const windowMs = Math.max(1, Date.now() - Date.parse(this.windowStartedAt));
    const orgPackets = this.packets.filter((p) => p.organizationId === args.organizationId);
    const orgAccepted = orgPackets.filter((p) => p.outcome === "accepted").length;
    const orgRejected = orgPackets.length - orgAccepted;
    return {
      windowStartedAt: this.windowStartedAt,
      packetsTotal: orgPackets.length,
      packetsAccepted: orgAccepted,
      packetsRejected: orgRejected,
      packetsPerMinute: (orgPackets.length / windowMs) * 60_000,
      avgGpsIntervalMs: this.avg(this.gpsIntervalsMs),
      avgProcessingLatencyMs: this.avg(this.processingLatenciesMs),
      avgSseBroadcastLatencyMs: this.avg(this.sseLatenciesMs),
      avgReplayWriteLatencyMs: this.avg(this.replayLatenciesMs),
      connectedDriversEstimate: args.connectedDriversEstimate,
      activeSessions: args.activeSessions,
      sseClientsGlobal: args.sseClientsGlobal,
      sseClientsOrg: args.sseClientsOrg,
    };
  }

  /// Process-wide counters (not tenant-scoped) for export footer.
  processCounters() {
    return {
      windowStartedAt: this.windowStartedAt,
      packetsTotal: this.packetsTotal,
      packetsAccepted: this.packetsAccepted,
      packetsRejected: this.packetsRejected,
    };
  }

  private pushRing<T>(ring: T[], item: T, capacity: number): void {
    ring.push(item);
    if (ring.length > capacity) {
      ring.splice(0, ring.length - capacity);
    }
  }

  private pushSample(samples: number[], value: number, capacity: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    samples.push(value);
    if (samples.length > capacity) {
      samples.splice(0, samples.length - capacity);
    }
  }

  private avg(samples: number[]): number | null {
    if (samples.length === 0) return null;
    const sum = samples.reduce((a, b) => a + b, 0);
    return sum / samples.length;
  }
}
