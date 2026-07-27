import { Injectable } from "@nestjs/common";
import { TrackingSessionStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TelematicsRealtimeService } from "../realtime/telematics-realtime.service";
import { TelematicsSettingsService } from "../settings/telematics-settings.service";
import {
  TrackingDebugBufferService,
  type TrackingDebugEvent,
  type TrackingDebugEventKind,
  type TrackingDebugPacket,
} from "./tracking-debug-buffer.service";

export interface TrackingDebugDiagnostic {
  code:
    | "duplicate_packets"
    | "late_packets"
    | "future_timestamps"
    | "offline_drivers"
    | "missing_heartbeat"
    | "invalid_coordinates"
    | "session_conflicts"
    | "vehicle_conflicts";
  severity: "info" | "warning" | "critical";
  count: number;
  message: string;
  sampleIds: string[];
}

@Injectable()
export class TrackingDebugService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buffer: TrackingDebugBufferService,
    private readonly realtime: TelematicsRealtimeService,
    private readonly settings: TelematicsSettingsService,
  ) {}

  async snapshot(organizationId: string) {
    const settings = await this.settings.getOrCreate(organizationId);
    const staleMs = settings.offlineThresholdSec * 1000;
    const now = Date.now();

    const [sessions, states, activeTrips, auditEvents] = await Promise.all([
      this.prisma.trackingSession.findMany({
        where: { organizationId, status: TrackingSessionStatus.ACTIVE },
        orderBy: { lastHeartbeatAt: "desc" },
        take: 200,
        select: {
          id: true,
          vehicleId: true,
          driverId: true,
          deviceId: true,
          dispatchId: true,
          source: true,
          status: true,
          startedAt: true,
          lastHeartbeatAt: true,
          lastPositionAt: true,
        },
      }),
      this.prisma.vehicleTelematicsState.findMany({
        where: { organizationId },
        take: 500,
        select: {
          vehicleId: true,
          driverId: true,
          tripId: true,
          latitude: true,
          longitude: true,
          speedKph: true,
          heading: true,
          movementState: true,
          lastRecordedAt: true,
          lastReceivedAt: true,
        },
      }),
      this.prisma.trip.findMany({
        where: { organizationId, status: "ACTIVE" },
        take: 100,
        select: {
          id: true,
          vehicleId: true,
          driverId: true,
          dispatchId: true,
          status: true,
          startedAt: true,
          pointCount: true,
        },
      }),
      this.prisma.auditLog.findMany({
        where: {
          organizationId,
          action: {
            in: [
              "auth.login",
              "dispatch.create",
              "dispatch.reassign",
              "dispatch.status_change",
              "dispatch.cancel",
              "dispatch.driver_status_change",
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 80,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          actorUserId: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ]);

    const packets = this.buffer.listPackets(organizationId, 150);
    const liveEvents = this.buffer.listEvents(organizationId, 150);
    const timeline = this.mergeTimeline(organizationId, liveEvents, auditEvents);

    const driverIds = new Set(
      sessions
        .filter((s) => s.source === "DRIVER_APP" && s.driverId)
        .map((s) => s.driverId as string),
    );

    const metrics = this.buffer.metricsSnapshot({
      organizationId,
      activeSessions: sessions.length,
      connectedDriversEstimate: driverIds.size,
      sseClientsGlobal: this.realtime.clientCount(),
      sseClientsOrg: this.realtime.orgClientCount(organizationId),
    });

    const diagnostics = this.buildDiagnostics({
      packets,
      sessions,
      states,
      staleMs,
      now,
    });

    const sessionViews = sessions.map((s) => {
      const ageSec = Math.max(0, Math.round((now - s.lastHeartbeatAt.getTime()) / 1000));
      const state = s.vehicleId ? states.find((st) => st.vehicleId === s.vehicleId) : null;
      const gpsAgeSec = state?.lastReceivedAt
        ? Math.max(0, Math.round((now - state.lastReceivedAt.getTime()) / 1000))
        : null;
      return {
        ...s,
        startedAt: s.startedAt.toISOString(),
        lastHeartbeatAt: s.lastHeartbeatAt.toISOString(),
        lastPositionAt: s.lastPositionAt?.toISOString() ?? null,
        heartbeatAgeSec: ageSec,
        gpsAgeSec,
        heartbeatMissing: ageSec * 1000 > staleMs,
        movementState: state?.movementState ?? null,
        lastReceivedAt: state?.lastReceivedAt?.toISOString() ?? null,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      offlineThresholdSec: settings.offlineThresholdSec,
      sessions: sessionViews,
      vehicleStates: states.map((s) => ({
        ...s,
        lastRecordedAt: s.lastRecordedAt?.toISOString() ?? null,
        lastReceivedAt: s.lastReceivedAt?.toISOString() ?? null,
        isStale: !s.lastReceivedAt || now - s.lastReceivedAt.getTime() > staleMs,
      })),
      trips: activeTrips.map((t) => ({
        ...t,
        startedAt: t.startedAt.toISOString(),
      })),
      sse: {
        clientsGlobal: this.realtime.clientCount(),
        clientsOrg: this.realtime.orgClientCount(organizationId),
        clients: this.realtime.clientSnapshot(organizationId),
      },
      packets,
      timeline,
      diagnostics,
      metrics,
    };
  }

  async exportJson(organizationId: string) {
    const snapshot = await this.snapshot(organizationId);
    return {
      exportedAt: new Date().toISOString(),
      organizationId,
      process: this.buffer.processCounters(),
      ...snapshot,
    };
  }

  private mergeTimeline(
    organizationId: string,
    live: TrackingDebugEvent[],
    audit: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      actorUserId: string | null;
      metadata: unknown;
      createdAt: Date;
    }>,
  ): TrackingDebugEvent[] {
    const fromAudit: TrackingDebugEvent[] = [];
    for (const row of audit) {
      const mapped = mapAuditToDebugEvent(organizationId, row);
      if (mapped) fromAudit.push(mapped);
    }
    return [...live, ...fromAudit]
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 200);
  }

  private buildDiagnostics(args: {
    packets: TrackingDebugPacket[];
    sessions: Array<{
      id: string;
      vehicleId: string | null;
      driverId: string | null;
      source: string;
      lastHeartbeatAt: Date;
    }>;
    states: Array<{
      vehicleId: string;
      driverId: string | null;
      lastReceivedAt: Date | null;
      movementState: string;
    }>;
    staleMs: number;
    now: number;
  }): TrackingDebugDiagnostic[] {
    const { packets, sessions, states, staleMs, now } = args;
    const out: TrackingDebugDiagnostic[] = [];

    const push = (
      code: TrackingDebugDiagnostic["code"],
      severity: TrackingDebugDiagnostic["severity"],
      items: string[],
      message: string,
    ) => {
      if (items.length === 0) return;
      out.push({ code, severity, count: items.length, message, sampleIds: items.slice(0, 8) });
    };

    push(
      "duplicate_packets",
      "warning",
      packets.filter((p) => p.reason === "duplicate_timestamp" || p.reason === "duplicate_idempotency_key").map((p) => p.id),
      "Duplicate GPS packets rejected by ingest validation",
    );
    push(
      "late_packets",
      "warning",
      packets.filter((p) => p.reason === "out_of_order").map((p) => p.id),
      "Late / out-of-order packets rejected (would not rewrite live state)",
    );
    push(
      "future_timestamps",
      "warning",
      packets.filter((p) => p.reason === "future_timestamp").map((p) => p.id),
      "Packets with device time too far in the future",
    );
    push(
      "invalid_coordinates",
      "critical",
      packets
        .filter((p) => p.reason === "invalid_coordinate" || p.reason === "null_island")
        .map((p) => p.id),
      "Invalid or Null Island coordinates rejected",
    );

    const offlineDrivers = sessions
      .filter(
        (s) =>
          s.source === "DRIVER_APP" &&
          now - s.lastHeartbeatAt.getTime() > staleMs,
      )
      .map((s) => s.id);
    push("offline_drivers", "critical", offlineDrivers, "DRIVER_APP sessions past offline threshold");

    const missingHeartbeat = sessions
      .filter((s) => now - s.lastHeartbeatAt.getTime() > staleMs)
      .map((s) => s.id);
    push("missing_heartbeat", "warning", missingHeartbeat, "Active sessions with missing heartbeat");

    const byDriver = new Map<string, string[]>();
    for (const s of sessions) {
      if (!s.driverId || s.source !== "DRIVER_APP") continue;
      const list = byDriver.get(s.driverId) ?? [];
      list.push(s.id);
      byDriver.set(s.driverId, list);
    }
    const sessionConflicts = [...byDriver.values()].filter((ids) => ids.length > 1).flat();
    push(
      "session_conflicts",
      "critical",
      sessionConflicts,
      "Driver has more than one ACTIVE DRIVER_APP session",
    );

    const byVehicle = new Map<string, string[]>();
    for (const s of sessions) {
      if (!s.vehicleId) continue;
      const list = byVehicle.get(s.vehicleId) ?? [];
      list.push(s.id);
      byVehicle.set(s.vehicleId, list);
    }
    const vehicleConflicts = [...byVehicle.entries()]
      .filter(([, ids]) => ids.length > 1)
      .flatMap(([, ids]) => ids);
    push(
      "vehicle_conflicts",
      "warning",
      vehicleConflicts,
      "Vehicle has multiple ACTIVE tracking sessions (different sources)",
    );

    // Offline drivers also from telematics state with driverId.
    const staleStateDrivers = states
      .filter(
        (s) =>
          s.driverId &&
          (s.movementState === "OFFLINE" ||
            !s.lastReceivedAt ||
            now - s.lastReceivedAt.getTime() > staleMs),
      )
      .map((s) => s.vehicleId);
    if (staleStateDrivers.length > 0 && offlineDrivers.length === 0) {
      push(
        "offline_drivers",
        "warning",
        staleStateDrivers,
        "Vehicles with driver linkage are offline / stale",
      );
    }

    return out;
  }
}

function mapAuditToDebugEvent(
  organizationId: string,
  row: {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    actorUserId: string | null;
    metadata: unknown;
    createdAt: Date;
  },
): TrackingDebugEvent | null {
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : undefined;

  let kind: TrackingDebugEventKind | null = null;
  let message = row.action;
  if (row.action === "auth.login") {
    kind = "driver_login";
    message = "User login (audit)";
  } else if (row.action === "dispatch.create" || row.action === "dispatch.reassign") {
    kind = "dispatch_assigned";
    message = row.action === "dispatch.create" ? "Dispatch created / assigned" : "Dispatch reassigned";
  } else if (
    row.action === "dispatch.status_change" ||
    row.action === "dispatch.driver_status_change" ||
    row.action === "dispatch.cancel"
  ) {
    const to = typeof meta?.to === "string" ? meta.to : null;
    if (to === "DELIVERED" || to === "CANCELLED" || row.action === "dispatch.cancel") {
      kind = "dispatch_finished";
      message = `Dispatch finished (${to ?? "CANCELLED"})`;
    } else {
      return null;
    }
  }

  if (!kind) return null;

  return {
    id: `audit:${row.id}`,
    organizationId,
    kind,
    at: row.createdAt.toISOString(),
    vehicleId: null,
    driverId: null,
    dispatchId: row.entityType === "Dispatch" ? row.entityId : null,
    sessionId: null,
    tripId: null,
    message,
    meta: { action: row.action, actorUserId: row.actorUserId, ...(meta ?? {}) },
  };
}
