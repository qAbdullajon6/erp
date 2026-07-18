import { Injectable } from "@nestjs/common";
import { TelematicsAnalyticsService } from "../../telematics/analytics/telematics-analytics.service";
import { AlertService } from "../../telematics/alerts/alert.service";
import { TelematicsService } from "../../telematics/telematics.service";
import type { AiTool } from "./tool.interface";
import { OPS, limitOf, str } from "./read.tools";

/// Copilot tools over live fleet telematics.
///
/// Read-only and OPS-scoped, mirroring the telematics HTTP controllers — the
/// Copilot is a second interface to the same services, never a way around their
/// authorization. Every tool returns the few fields an answer needs, not the
/// raw entity, exactly like ReadTools.
@Injectable()
export class TelematicsAiTools {
  constructor(
    private readonly telematics: TelematicsService,
    private readonly alerts: AlertService,
    private readonly analytics: TelematicsAnalyticsService,
  ) {}

  all(): AiTool[] {
    return [this.fleetStatus(), this.trackVehicle(), this.listFleetAlerts(), this.driverSafety()];
  }

  private fleetStatus(): AiTool {
    return {
      name: "fleet_status",
      description:
        "Summarise where the fleet is right now: how many vehicles are moving, idling, stopped or offline. " +
        "Use this to answer 'how many trucks are on the road' or 'is anything offline'.",
      allowedRoles: OPS,
      mutating: false,
      parameters: { type: "object", additionalProperties: false, properties: {} },
      handler: async (_args, actor) => {
        const live = await this.telematics.liveFleet(actor.organizationId);
        const counts = { moving: 0, idling: 0, stopped: 0, offline: 0, unknown: 0 };
        for (const v of live.vehicles) {
          const key = v.movementState.toLowerCase() as keyof typeof counts;
          if (key in counts) counts[key] += 1;
        }
        return {
          total: live.vehicles.length,
          ...counts,
          vehicles: live.vehicles.slice(0, 10).map((v) => ({
            vehicle: v.plateNumber ?? v.vehicleCode,
            state: v.movementState,
            speedKph: v.speedKph,
            driver: v.driverName,
          })),
        };
      },
    };
  }

  private trackVehicle(): AiTool {
    return {
      name: "track_vehicle",
      description:
        "Get a single vehicle's live position, speed and movement state, plus its active trip if any. " +
        "Pass the vehicle's UUID from search_vehicles. Use this to answer 'where is truck 7 right now'.",
      allowedRoles: OPS,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { vehicleId: { type: "string", description: "Vehicle UUID from search_vehicles." } },
        required: ["vehicleId"],
      },
      handler: async (args, actor) => {
        const vehicleId = str(args.vehicleId);
        if (!vehicleId) return { error: "vehicleId is required" };
        const live = await this.telematics.liveVehicle(actor.organizationId, vehicleId);
        return {
          vehicle: live.vehicle.plateNumber ?? live.vehicle.vehicleCode,
          state: live.state?.movementState ?? "UNKNOWN",
          latitude: live.state?.latitude ?? null,
          longitude: live.state?.longitude ?? null,
          speedKph: live.state?.speedKph ?? null,
          lastUpdatedAt: live.state?.lastRecordedAt ?? null,
          activeTrip: live.activeTrip ? { id: live.activeTrip.id, distanceKm: live.activeTrip.distanceKm } : null,
        };
      },
    };
  }

  private listFleetAlerts(): AiTool {
    return {
      name: "list_fleet_alerts",
      description:
        "List open fleet telematics alerts (speeding, idling, geofence, offline, harsh driving, low fuel, check-engine). " +
        "Use this to answer 'what fleet issues need attention'.",
      allowedRoles: OPS,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", description: "Optional alert type filter, e.g. SPEEDING." },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
      },
      handler: async (args, actor) => {
        const result = await this.alerts.list(actor.organizationId, {
          status: "OPEN",
          type: str(args.type) as never,
          page: 1,
          limit: limitOf(args),
          sortOrder: "desc",
        } as never);
        return {
          openCount: result.openCount,
          items: result.items.map((a) => ({ type: a.type, severity: a.severity, title: a.title, at: a.occurredAt })),
        };
      },
    };
  }

  private driverSafety(): AiTool {
    return {
      name: "driver_safety",
      description:
        "Rank drivers by safety score over a period, from harsh-driving and speeding events per 100 km. " +
        "Use this to answer 'who are my safest / riskiest drivers'.",
      allowedRoles: OPS,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          from: { type: "string", description: "ISO date, start of window (default last 30 days)." },
          to: { type: "string", description: "ISO date, end of window." },
        },
      },
      handler: async (args, actor) => {
        const result = await this.analytics.driverBehavior(actor.organizationId, {
          from: str(args.from),
          to: str(args.to),
        } as never);
        return {
          drivers: result.drivers.slice(0, 10).map((d) => ({
            name: d.name,
            safetyScore: d.safetyScore,
            trips: d.trips,
            distanceKm: d.distanceKm,
            harshEvents: d.harshAccel + d.harshBrake + d.harshCorner,
            speedingEvents: d.speedingEvents,
          })),
        };
      },
    };
  }
}
