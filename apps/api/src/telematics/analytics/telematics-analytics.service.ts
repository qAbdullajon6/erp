import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsQueryDto } from "../dto/analytics-query.dto";
import { estimateFuelLiters, litersPer100KmForType } from "./fuel-model";

/// Read-side analytics over the derived telematics data. Everything here is an
/// aggregate over completed trips, alerts and the latest health snapshots — the
/// raw position stream is never scanned for a dashboard, which is exactly why
/// the trip rollups exist.
///
/// The driver-safety score is an explicit, documented formula (not a black
/// box): incidents per 100 km, weighted, subtracted from 100. It ranks drivers
/// consistently and is stable to tune; it is not a certified telematics safety
/// rating and is labelled a score, not a grade.

const DEFAULT_WINDOW_DAYS = 30;

/// Weight applied to weighted-incidents-per-100km before subtracting from 100.
const SAFETY_PENALTY_PER_INCIDENT_PER_100KM = 2.5;

@Injectable()
export class TelematicsAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveRange(query: AnalyticsQueryDto): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return { from, to };
  }

  private tripWhere(organizationId: string, query: AnalyticsQueryDto): Prisma.TripWhereInput {
    const { from, to } = this.resolveRange(query);
    return {
      organizationId,
      startedAt: { gte: from, lte: to },
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
    };
  }

  async overview(organizationId: string, query: AnalyticsQueryDto) {
    const { from, to } = this.resolveRange(query);
    const where = this.tripWhere(organizationId, query);

    const [tripAgg, tripCount, totalVehicles, states, openAlerts] = await Promise.all([
      this.prisma.trip.aggregate({
        where,
        _sum: { distanceKm: true, movingSec: true, idleSec: true, harshAccelCount: true, harshBrakeCount: true, harshCornerCount: true, speedingCount: true },
        _max: { maxSpeedKph: true },
      }),
      this.prisma.trip.count({ where }),
      this.prisma.vehicle.count({ where: { organizationId, archivedAt: null } }),
      this.prisma.vehicleTelematicsState.groupBy({ by: ["movementState"], where: { organizationId }, _count: true }),
      this.prisma.telematicsAlert.count({ where: { organizationId, status: "OPEN" } }),
    ]);

    const movingSec = tripAgg._sum.movingSec ?? 0;
    const idleSec = tripAgg._sum.idleSec ?? 0;
    const byState = Object.fromEntries(states.map((s) => [s.movementState, s._count as number]));

    return {
      range: { from, to },
      totalDistanceKm: Number(tripAgg._sum.distanceKm ?? 0),
      totalTrips: tripCount,
      movingHours: round(movingSec / 3600),
      idleHours: round(idleSec / 3600),
      utilizationPct: movingSec + idleSec > 0 ? round((movingSec / (movingSec + idleSec)) * 100) : 0,
      maxSpeedKph: tripAgg._max.maxSpeedKph ?? 0,
      harshEvents:
        (tripAgg._sum.harshAccelCount ?? 0) + (tripAgg._sum.harshBrakeCount ?? 0) + (tripAgg._sum.harshCornerCount ?? 0),
      speedingEvents: tripAgg._sum.speedingCount ?? 0,
      fleet: {
        totalVehicles,
        moving: byState.MOVING ?? 0,
        idling: byState.IDLING ?? 0,
        stopped: byState.STOPPED ?? 0,
        offline: byState.OFFLINE ?? 0,
      },
      openAlerts,
    };
  }

  async fleetUtilization(organizationId: string, query: AnalyticsQueryDto) {
    const where = this.tripWhere(organizationId, query);
    const grouped = await this.prisma.trip.groupBy({
      by: ["vehicleId"],
      where,
      _sum: { distanceKm: true, movingSec: true, idleSec: true, durationSec: true },
      _count: { _all: true },
    });

    const vehicles = await this.prisma.vehicle.findMany({
      where: { id: { in: grouped.map((g) => g.vehicleId) }, organizationId },
      select: { id: true, vehicleCode: true, plateNumber: true, type: true },
    });
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    const rows = grouped
      .map((g) => {
        const movingSec = g._sum.movingSec ?? 0;
        const idleSec = g._sum.idleSec ?? 0;
        const v = vehicleById.get(g.vehicleId);
        return {
          vehicleId: g.vehicleId,
          vehicleCode: v?.vehicleCode ?? null,
          plateNumber: v?.plateNumber ?? null,
          trips: g._count._all,
          distanceKm: round(Number(g._sum.distanceKm ?? 0)),
          movingHours: round(movingSec / 3600),
          idleHours: round(idleSec / 3600),
          utilizationPct: movingSec + idleSec > 0 ? round((movingSec / (movingSec + idleSec)) * 100) : 0,
        };
      })
      .sort((a, b) => b.distanceKm - a.distanceKm);

    return { range: this.resolveRange(query), vehicles: rows };
  }

  async driverBehavior(organizationId: string, query: AnalyticsQueryDto) {
    const where = { ...this.tripWhere(organizationId, query), driverId: query.driverId ?? { not: null } };
    const grouped = await this.prisma.trip.groupBy({
      by: ["driverId"],
      where,
      _sum: {
        distanceKm: true,
        harshAccelCount: true,
        harshBrakeCount: true,
        harshCornerCount: true,
        speedingCount: true,
      },
      _max: { maxSpeedKph: true },
      _count: { _all: true },
    });

    const driverIds = grouped.map((g) => g.driverId).filter((id): id is string => !!id);
    const drivers = await this.prisma.driver.findMany({
      where: { id: { in: driverIds }, organizationId },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });
    const driverById = new Map(drivers.map((d) => [d.id, d]));

    const rows = grouped
      .filter((g) => g.driverId)
      .map((g) => {
        const distanceKm = Number(g._sum.distanceKm ?? 0);
        const harsh = (g._sum.harshAccelCount ?? 0) + (g._sum.harshBrakeCount ?? 0) + (g._sum.harshCornerCount ?? 0);
        const speeding = g._sum.speedingCount ?? 0;
        const weightedIncidents = harsh + speeding * 1.5;
        const per100Km = distanceKm > 0 ? (weightedIncidents / distanceKm) * 100 : 0;
        const safetyScore = clamp(100 - per100Km * SAFETY_PENALTY_PER_INCIDENT_PER_100KM, 0, 100);
        const d = driverById.get(g.driverId as string);
        return {
          driverId: g.driverId,
          employeeCode: d?.employeeCode ?? null,
          name: d ? `${d.firstName} ${d.lastName}` : null,
          trips: g._count._all,
          distanceKm: round(distanceKm),
          harshAccel: g._sum.harshAccelCount ?? 0,
          harshBrake: g._sum.harshBrakeCount ?? 0,
          harshCorner: g._sum.harshCornerCount ?? 0,
          speedingEvents: speeding,
          maxSpeedKph: g._max.maxSpeedKph ?? 0,
          safetyScore: round(safetyScore),
        };
      })
      .sort((a, b) => b.safetyScore - a.safetyScore);

    return { range: this.resolveRange(query), drivers: rows };
  }

  async fuelAnalytics(organizationId: string, query: AnalyticsQueryDto) {
    const where = this.tripWhere(organizationId, query);
    const grouped = await this.prisma.trip.groupBy({
      by: ["vehicleId"],
      where,
      _sum: { distanceKm: true, fuelConsumedL: true, idleSec: true },
    });
    const vehicles = await this.prisma.vehicle.findMany({
      where: { id: { in: grouped.map((g) => g.vehicleId) }, organizationId },
      select: { id: true, vehicleCode: true, plateNumber: true, type: true },
    });
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    let totalDistance = 0;
    let totalFuel = 0;
    const rows = grouped.map((g) => {
      const v = vehicleById.get(g.vehicleId);
      const distanceKm = Number(g._sum.distanceKm ?? 0);
      // Prefer the stored per-trip estimate; fall back to the model if absent.
      const fuelL = g._sum.fuelConsumedL != null ? Number(g._sum.fuelConsumedL) : estimateFuelLiters(distanceKm, v?.type);
      totalDistance += distanceKm;
      totalFuel += fuelL;
      return {
        vehicleId: g.vehicleId,
        vehicleCode: v?.vehicleCode ?? null,
        plateNumber: v?.plateNumber ?? null,
        distanceKm: round(distanceKm),
        estimatedFuelLiters: round(fuelL),
        ratedLitersPer100Km: litersPer100KmForType(v?.type),
        litersPer100Km: distanceKm > 0 ? round((fuelL / distanceKm) * 100) : 0,
      };
    });

    return {
      range: this.resolveRange(query),
      estimate: true,
      totalDistanceKm: round(totalDistance),
      totalEstimatedFuelLiters: round(totalFuel),
      fleetLitersPer100Km: totalDistance > 0 ? round((totalFuel / totalDistance) * 100) : 0,
      vehicles: rows.sort((a, b) => b.estimatedFuelLiters - a.estimatedFuelLiters),
    };
  }

  async vehicleHealth(organizationId: string, query: AnalyticsQueryDto) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, archivedAt: null, ...(query.vehicleId ? { id: query.vehicleId } : {}) },
      select: { id: true, vehicleCode: true, plateNumber: true },
    });

    const rows = await Promise.all(
      vehicles.map(async (v) => {
        const [snapshot, openAlerts] = await Promise.all([
          this.prisma.vehicleHealthSnapshot.findFirst({
            where: { organizationId, vehicleId: v.id },
            orderBy: { recordedAt: "desc" },
          }),
          this.prisma.telematicsAlert.count({
            where: { organizationId, vehicleId: v.id, status: "OPEN", type: { in: ["CHECK_ENGINE", "LOW_FUEL"] } },
          }),
        ]);
        return {
          vehicleId: v.id,
          vehicleCode: v.vehicleCode,
          plateNumber: v.plateNumber,
          recordedAt: snapshot?.recordedAt ?? null,
          odometerKm: snapshot?.odometerKm ?? null,
          engineHours: snapshot?.engineHours ?? null,
          fuelLevelPct: snapshot?.fuelLevelPct ?? null,
          batteryVoltage: snapshot?.batteryVoltage ?? null,
          coolantTempC: snapshot?.coolantTempC ?? null,
          checkEngineOn: snapshot?.checkEngineOn ?? null,
          dtcCodes: snapshot?.dtcCodes ?? null,
          openHealthAlerts: openAlerts,
        };
      }),
    );

    return { vehicles: rows };
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
