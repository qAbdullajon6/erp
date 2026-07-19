import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { MovementState, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  classifyHarshDriving,
  isSpeeding,
  overSpeedKph,
  speedingSeverity,
} from "../alerts/alert-rules";
import { AlertService } from "../alerts/alert.service";
import { GeofenceService } from "../geofences/geofence.service";
import { haversineKm, haversineMeters, isValidCoordinate, speedKphBetween } from "../geo/haversine.util";
import { classifyMovement } from "./movement-detector";
import type { NormalizedPosition } from "../providers/telematics-provider.interface";
import { TelematicsRealtimeService } from "../realtime/telematics-realtime.service";
import { TelematicsSettingsService } from "../settings/telematics-settings.service";
import type { TripAggregate } from "../trips/trip.service";
import { TripService } from "../trips/trip.service";

export interface IngestTarget {
  organizationId: string;
  vehicleId: string;
  driverId?: string | null;
  deviceId?: string | null;
}

export interface IngestResult {
  accepted: number;
  rejected: number;
  tripId: string | null;
  latest: { latitude: number; longitude: number; speedKph: number | null; movementState: MovementState; recordedAt: Date } | null;
}

interface Running {
  prevLat: number | null;
  prevLng: number | null;
  prevRecordedAt: Date | null;
  prevHeading: number | null;
  prevSpeedKph: number;
  movementState: MovementState;
  lastMovingAt: Date | null;
  stationarySince: Date | null;
  lastRecordedAt: Date | null;
  tripId: string | null;
  agg: TripAggregate | null;
}

/// The heart of telematics: it turns a stream of raw fixes into everything
/// derived — the live vehicle state, the trip and its rollups, geofence
/// crossings, and the alerts. Every fix flows through the same steps so a fix
/// that arrives over a webhook and one entered in the driver app behave
/// identically.
///
/// It is intentionally the ONLY writer of GpsPosition and
/// VehicleTelematicsState. Ordering matters — speed and distance are computed
/// from the previous fix — so fixes are sorted by device time before the walk,
/// which also makes a buffered device flushing a backlog behave correctly.
///
/// Side effects (alerts, geofence events, workflow emits) are wrapped so that a
/// failure in any of them can never lose the position itself: the raw stream is
/// the source of truth and must always persist.
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TelematicsSettingsService,
    private readonly trips: TripService,
    private readonly geofences: GeofenceService,
    private readonly alerts: AlertService,
    private readonly realtime: TelematicsRealtimeService,
  ) {}

  /// Ingests positions posted by a signed-in DRIVER for their own location.
  /// The vehicle is resolved server-side from the driver's in-progress
  /// dispatch — the client never names a vehicle, so a driver cannot post
  /// another vehicle's location. Throws when the driver has no active dispatch
  /// to attribute the fixes to.
  async ingestForDriver(
    organizationId: string,
    userId: string,
    positions: NormalizedPosition[],
  ): Promise<IngestResult> {
    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId, archivedAt: null },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException("No driver profile is linked to your account");
    }
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { organizationId, driverId: driver.id, status: { in: ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] } },
      orderBy: { updatedAt: "desc" },
      select: { vehicleId: true },
    });
    if (!dispatch) {
      throw new NotFoundException("You have no active dispatch to attribute a location to");
    }
    return this.ingestForVehicle({ organizationId, vehicleId: dispatch.vehicleId, driverId: driver.id }, positions);
  }

  async ingestForVehicle(target: IngestTarget, positions: NormalizedPosition[]): Promise<IngestResult> {
    const valid = positions.filter((p) => isValidCoordinate({ latitude: p.latitude, longitude: p.longitude }));
    const rejected = positions.length - valid.length;
    if (valid.length === 0) {
      return { accepted: 0, rejected, tripId: null, latest: null };
    }
    valid.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

    const settings = await this.settings.getOrCreate(target.organizationId);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: target.vehicleId, organizationId: target.organizationId },
      select: { id: true, vehicleCode: true, plateNumber: true },
    });
    if (!vehicle) {
      // The vehicle was deleted or belongs to another org — never trust the caller's id.
      return { accepted: 0, rejected: positions.length, tripId: null, latest: null };
    }
    const vehicleLabel = vehicle.plateNumber || vehicle.vehicleCode;

    const state = await this.prisma.vehicleTelematicsState.findUnique({ where: { vehicleId: target.vehicleId } });
    const activeTrip = await this.trips.getActive(target.organizationId, target.vehicleId);

    const running: Running = {
      prevLat: state?.latitude ?? null,
      prevLng: state?.longitude ?? null,
      prevRecordedAt: state?.lastRecordedAt ?? null,
      prevHeading: state?.heading ?? null,
      prevSpeedKph: state?.speedKph ?? 0,
      movementState: state?.movementState ?? "UNKNOWN",
      lastMovingAt: state?.lastMovingAt ?? null,
      stationarySince: state?.stationarySince ?? null,
      lastRecordedAt: state?.lastRecordedAt ?? null,
      tripId: activeTrip?.id ?? null,
      agg: activeTrip ? this.seedAggregate(activeTrip) : null,
    };

    let latest: IngestResult["latest"] = null;
    for (const fix of valid) {
      latest = await this.processFix(target, settings, vehicleLabel, fix, running);
    }

    // Persist the derived live state once, after the whole batch.
    await this.prisma.vehicleTelematicsState.upsert({
      where: { vehicleId: target.vehicleId },
      create: {
        organizationId: target.organizationId,
        vehicleId: target.vehicleId,
        driverId: target.driverId ?? null,
        tripId: running.tripId,
        latitude: running.prevLat,
        longitude: running.prevLng,
        speedKph: running.prevSpeedKph,
        heading: running.prevHeading,
        movementState: running.movementState,
        lastMovingAt: running.lastMovingAt,
        stationarySince: running.stationarySince,
        lastRecordedAt: running.lastRecordedAt,
        lastReceivedAt: new Date(),
      },
      update: {
        driverId: target.driverId ?? state?.driverId ?? null,
        tripId: running.tripId,
        latitude: running.prevLat,
        longitude: running.prevLng,
        speedKph: running.prevSpeedKph,
        heading: running.prevHeading,
        movementState: running.movementState,
        lastMovingAt: running.lastMovingAt,
        stationarySince: running.stationarySince,
        lastRecordedAt: running.lastRecordedAt,
        lastReceivedAt: new Date(),
      },
    });

    if (running.tripId && running.agg) {
      await this.trips.saveAggregate(running.tripId, running.agg);
    }

    // The vehicle is reporting again — clear any open "gone offline" alert.
    await this.alerts.autoResolve(target.organizationId, `offline:${target.vehicleId}`).catch(() => undefined);
    if (target.deviceId) {
      await this.prisma.telematicsDevice
        .update({ where: { id: target.deviceId }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    }

    // Broadcast the fresh state for the live map.
    if (latest) {
      this.realtime.publish(target.organizationId, {
        type: "state",
        vehicleId: target.vehicleId,
        at: latest.recordedAt.toISOString(),
        payload: {
          vehicleId: target.vehicleId,
          vehicleLabel,
          latitude: latest.latitude,
          longitude: latest.longitude,
          speedKph: latest.speedKph,
          heading: running.prevHeading,
          movementState: latest.movementState,
          driverId: target.driverId ?? state?.driverId ?? null,
          tripId: running.tripId,
        },
      });
    }

    return { accepted: valid.length, rejected, tripId: running.tripId, latest };
  }

  private async processFix(
    target: IngestTarget,
    settings: Awaited<ReturnType<TelematicsSettingsService["getOrCreate"]>>,
    vehicleLabel: string,
    fix: NormalizedPosition,
    running: Running,
  ): Promise<IngestResult["latest"]> {
    const curr = { latitude: fix.latitude, longitude: fix.longitude };
    const prev =
      running.prevLat != null && running.prevLng != null
        ? { latitude: running.prevLat, longitude: running.prevLng }
        : null;

    const segmentSeconds =
      running.prevRecordedAt != null
        ? Math.max(0, (fix.recordedAt.getTime() - running.prevRecordedAt.getTime()) / 1000)
        : 0;
    const distanceM = prev ? haversineMeters(prev, curr) : 0;

    // Prefer a device-reported speed; derive it from the geometry when absent.
    const derivedSpeed = prev && segmentSeconds > 0 ? speedKphBetween(prev, curr, segmentSeconds) : 0;
    const speedKph = fix.speedKph != null && Number.isFinite(fix.speedKph) ? fix.speedKph : derivedSpeed;

    const movement = classifyMovement(
      { speedKph, ignitionOn: fix.ignitionOn ?? null, recordedAt: fix.recordedAt },
      {
        movementState: running.movementState,
        lastMovingAt: running.lastMovingAt,
        stationarySince: running.stationarySince,
        lastRecordedAt: running.lastRecordedAt,
      },
      { idleThresholdSec: settings.idleThresholdSec, stopThresholdSec: settings.stopThresholdSec },
    );

    // Open a trip the moment the vehicle starts moving with none active.
    if (movement.movementState === "MOVING" && !running.tripId) {
      try {
        const trip = await this.trips.open({
          organizationId: target.organizationId,
          vehicleId: target.vehicleId,
          driverId: target.driverId ?? null,
          startedAt: fix.recordedAt,
          startLat: fix.latitude,
          startLng: fix.longitude,
          startOdometerKm: fix.odometerKm ?? null,
        });
        running.tripId = trip.id;
        running.agg = this.seedAggregate(trip);
      } catch (err) {
        this.logger.error(`Failed to open trip: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Persist the raw fix (the source of truth).
    const saved = await this.prisma.gpsPosition.create({
      data: {
        organizationId: target.organizationId,
        deviceId: target.deviceId ?? null,
        vehicleId: target.vehicleId,
        driverId: target.driverId ?? null,
        tripId: running.tripId,
        recordedAt: fix.recordedAt,
        latitude: fix.latitude,
        longitude: fix.longitude,
        altitudeM: fix.altitudeM ?? null,
        speedKph,
        heading: fix.heading ?? running.prevHeading,
        accuracyM: fix.accuracyM ?? null,
        ignitionOn: fix.ignitionOn ?? null,
        odometerKm: fix.odometerKm ?? null,
        fuelLevelPct: fix.fuelLevelPct ?? null,
        satellites: fix.satellites ?? null,
        distanceFromPrevM: prev ? distanceM : null,
        movementState: movement.movementState,
        raw: (fix.raw as Prisma.InputJsonValue) ?? undefined,
      },
      select: { id: true },
    });

    // Update trip rollups from this segment.
    if (running.agg) {
      const harsh =
        prev && segmentSeconds > 0
          ? classifyHarshDriving(
              { speedKph: running.prevSpeedKph, heading: running.prevHeading },
              { speedKph, heading: fix.heading ?? running.prevHeading },
              segmentSeconds,
              { harshAccelMs2: settings.harshAccelMs2, harshBrakeMs2: settings.harshBrakeMs2, harshCornerMs2: settings.harshCornerMs2 },
            )
          : { isHarshAccel: false, isHarshBrake: false, isHarshCorner: false, accel: 0, brake: 0, cornering: 0 };

      const speeding = isSpeeding(speedKph, settings.speedLimitKph, settings.speedingToleranceKph);

      running.agg.distanceKm += prev ? haversineKm(prev, curr) : 0;
      running.agg.durationSec += segmentSeconds;
      running.agg.movingSec += movement.movementState === "MOVING" ? segmentSeconds : 0;
      running.agg.idleSec += movement.movementState === "IDLING" ? segmentSeconds : 0;
      running.agg.stopCount += movement.crossedStopThreshold ? 1 : 0;
      running.agg.maxSpeedKph = Math.max(running.agg.maxSpeedKph, speedKph);
      running.agg.harshAccelCount += harsh.isHarshAccel ? 1 : 0;
      running.agg.harshBrakeCount += harsh.isHarshBrake ? 1 : 0;
      running.agg.harshCornerCount += harsh.isHarshCorner ? 1 : 0;
      running.agg.speedingCount += speeding ? 1 : 0;
      running.agg.pointCount += 1;
      running.agg.endLat = fix.latitude;
      running.agg.endLng = fix.longitude;
      running.agg.endOdometerKm = fix.odometerKm ?? running.agg.endOdometerKm;

      await this.evaluateHarshAlerts(target, vehicleLabel, fix, harsh, settings);
    }

    // Alerts and geofences — never allowed to lose the fix.
    try {
      await this.evaluateSpeeding(target, vehicleLabel, fix, speedKph, settings);
      await this.evaluateIdle(target, vehicleLabel, fix, movement, settings);
      await this.evaluateFuelAndHealth(target, vehicleLabel, fix, settings);
      await this.geofences.evaluate({
        organizationId: target.organizationId,
        vehicleId: target.vehicleId,
        driverId: target.driverId ?? null,
        tripId: running.tripId,
        previous: prev,
        current: curr,
        occurredAt: fix.recordedAt,
        alertsEnabled: settings.geofenceAlertsEnabled,
        vehicleLabel,
      });
    } catch (err) {
      this.logger.error(`Post-persist evaluation failed for vehicle ${target.vehicleId}: ${err instanceof Error ? err.message : err}`);
    }

    // Broadcast the individual fix for live route drawing.
    this.realtime.publish(target.organizationId, {
      type: "position",
      vehicleId: target.vehicleId,
      at: fix.recordedAt.toISOString(),
      payload: {
        id: saved.id,
        vehicleId: target.vehicleId,
        latitude: fix.latitude,
        longitude: fix.longitude,
        speedKph,
        heading: fix.heading ?? running.prevHeading,
        movementState: movement.movementState,
        tripId: running.tripId,
      },
    });

    // Advance the running cursor.
    running.prevLat = fix.latitude;
    running.prevLng = fix.longitude;
    running.prevRecordedAt = fix.recordedAt;
    running.prevHeading = fix.heading ?? running.prevHeading;
    running.prevSpeedKph = speedKph;
    running.movementState = movement.movementState;
    running.lastMovingAt = movement.lastMovingAt;
    running.stationarySince = movement.stationarySince;
    running.lastRecordedAt = fix.recordedAt;

    return {
      latitude: fix.latitude,
      longitude: fix.longitude,
      speedKph,
      movementState: movement.movementState,
      recordedAt: fix.recordedAt,
    };
  }

  private async evaluateSpeeding(
    target: IngestTarget,
    vehicleLabel: string,
    fix: NormalizedPosition,
    speedKph: number,
    settings: Awaited<ReturnType<TelematicsSettingsService["getOrCreate"]>>,
  ): Promise<void> {
    if (!settings.speedingAlertsEnabled) return;
    const dedupeKey = `speeding:${target.vehicleId}`;
    const over = overSpeedKph(speedKph, settings.speedLimitKph, settings.speedingToleranceKph);
    if (over > 0) {
      await this.alerts.raise({
        organizationId: target.organizationId,
        type: "SPEEDING",
        severity: speedingSeverity(over),
        vehicleId: target.vehicleId,
        driverId: target.driverId ?? null,
        title: `${vehicleLabel} is speeding`,
        message: `${vehicleLabel} at ${Math.round(speedKph)} km/h — ${Math.round(over)} km/h over the ${settings.speedLimitKph} km/h limit.`,
        latitude: fix.latitude,
        longitude: fix.longitude,
        value: Math.round(speedKph),
        threshold: settings.speedLimitKph + settings.speedingToleranceKph,
        occurredAt: fix.recordedAt,
        dedupeKey,
      });
    } else {
      await this.alerts.autoResolve(target.organizationId, dedupeKey);
    }
  }

  private async evaluateIdle(
    target: IngestTarget,
    vehicleLabel: string,
    fix: NormalizedPosition,
    movement: ReturnType<typeof classifyMovement>,
    settings: Awaited<ReturnType<TelematicsSettingsService["getOrCreate"]>>,
  ): Promise<void> {
    if (!settings.idleAlertsEnabled) return;
    if (movement.crossedIdleThreshold && movement.stationarySince) {
      await this.alerts.raise({
        organizationId: target.organizationId,
        type: "IDLE",
        severity: "LOW",
        vehicleId: target.vehicleId,
        driverId: target.driverId ?? null,
        title: `${vehicleLabel} idling`,
        message: `${vehicleLabel} has been idling for over ${Math.round(settings.idleThresholdSec / 60)} min with the engine on.`,
        latitude: fix.latitude,
        longitude: fix.longitude,
        value: Math.round(movement.stationarySec),
        threshold: settings.idleThresholdSec,
        occurredAt: fix.recordedAt,
        dedupeKey: `idle:${target.vehicleId}:${movement.stationarySince.getTime()}`,
      });
    }
    if (movement.movementState === "MOVING") {
      // The engine is moving again — clear any open idle for the last spell is
      // not needed (idle keys are per-spell), but a lingering speeding key is
      // handled in evaluateSpeeding. Nothing to do here.
    }
  }

  private async evaluateHarshAlerts(
    target: IngestTarget,
    vehicleLabel: string,
    fix: NormalizedPosition,
    harsh: ReturnType<typeof classifyHarshDriving>,
    settings: Awaited<ReturnType<TelematicsSettingsService["getOrCreate"]>>,
  ): Promise<void> {
    if (!settings.harshDrivingAlertsEnabled) return;
    const base = {
      organizationId: target.organizationId,
      vehicleId: target.vehicleId,
      driverId: target.driverId ?? null,
      latitude: fix.latitude,
      longitude: fix.longitude,
      occurredAt: fix.recordedAt,
      severity: "MEDIUM" as const,
      dedupeKey: null,
    };
    if (harsh.isHarshBrake) {
      await this.alerts.raise({ ...base, type: "HARSH_BRAKE", title: `${vehicleLabel} braked hard`, message: `Harsh braking detected (${harsh.brake.toFixed(1)} m/s²).`, value: harsh.brake, threshold: settings.harshBrakeMs2 });
    }
    if (harsh.isHarshAccel) {
      await this.alerts.raise({ ...base, type: "HARSH_ACCEL", title: `${vehicleLabel} accelerated hard`, message: `Harsh acceleration detected (${harsh.accel.toFixed(1)} m/s²).`, value: harsh.accel, threshold: settings.harshAccelMs2 });
    }
    if (harsh.isHarshCorner) {
      await this.alerts.raise({ ...base, type: "HARSH_CORNER", title: `${vehicleLabel} cornered hard`, message: `Harsh cornering detected (${harsh.cornering.toFixed(1)} m/s²).`, value: harsh.cornering, threshold: settings.harshCornerMs2 });
    }
  }

  private async evaluateFuelAndHealth(
    target: IngestTarget,
    vehicleLabel: string,
    fix: NormalizedPosition,
    settings: Awaited<ReturnType<TelematicsSettingsService["getOrCreate"]>>,
  ): Promise<void> {
    // Low fuel.
    if (settings.healthAlertsEnabled && fix.fuelLevelPct != null && settings.lowFuelThresholdPct > 0) {
      const dedupeKey = `lowfuel:${target.vehicleId}`;
      if (fix.fuelLevelPct <= settings.lowFuelThresholdPct) {
        await this.alerts.raise({
          organizationId: target.organizationId,
          type: "LOW_FUEL",
          severity: "MEDIUM",
          vehicleId: target.vehicleId,
          driverId: target.driverId ?? null,
          title: `${vehicleLabel} is low on fuel`,
          message: `Fuel level ${Math.round(fix.fuelLevelPct)}% is at or below the ${settings.lowFuelThresholdPct}% threshold.`,
          latitude: fix.latitude,
          longitude: fix.longitude,
          value: Math.round(fix.fuelLevelPct),
          threshold: settings.lowFuelThresholdPct,
          occurredAt: fix.recordedAt,
          dedupeKey,
        });
      } else {
        await this.alerts.autoResolve(target.organizationId, dedupeKey);
      }
    }

    // Diagnostics snapshot + check-engine.
    const health = fix.health;
    if (health) {
      await this.prisma.vehicleHealthSnapshot.create({
        data: {
          organizationId: target.organizationId,
          vehicleId: target.vehicleId,
          deviceId: target.deviceId ?? null,
          recordedAt: fix.recordedAt,
          odometerKm: health.odometerKm ?? fix.odometerKm ?? null,
          engineHours: health.engineHours ?? null,
          fuelLevelPct: health.fuelLevelPct ?? fix.fuelLevelPct ?? null,
          batteryVoltage: health.batteryVoltage ?? null,
          coolantTempC: health.coolantTempC ?? null,
          engineTempC: health.engineTempC ?? null,
          checkEngineOn: health.checkEngineOn ?? null,
          dtcCodes: (health.dtcCodes as Prisma.InputJsonValue) ?? undefined,
          tirePressures: (health.tirePressures as Prisma.InputJsonValue) ?? undefined,
        },
      });

      if (settings.healthAlertsEnabled && health.checkEngineOn) {
        await this.alerts.raise({
          organizationId: target.organizationId,
          type: "CHECK_ENGINE",
          severity: "HIGH",
          vehicleId: target.vehicleId,
          driverId: target.driverId ?? null,
          title: `${vehicleLabel} check-engine light is on`,
          message: health.dtcCodes && health.dtcCodes.length > 0
            ? `Active fault codes: ${health.dtcCodes.join(", ")}.`
            : `The check-engine indicator is active.`,
          latitude: fix.latitude,
          longitude: fix.longitude,
          occurredAt: fix.recordedAt,
          dedupeKey: `checkengine:${target.vehicleId}`,
          metadata: { dtcCodes: health.dtcCodes ?? [] },
        });
      }
    }
  }

  private seedAggregate(trip: { distanceKm: Prisma.Decimal; durationSec: number; movingSec: number; idleSec: number; stopCount: number; maxSpeedKph: number; harshAccelCount: number; harshBrakeCount: number; harshCornerCount: number; speedingCount: number; pointCount: number; endLat: number | null; endLng: number | null; endOdometerKm: number | null }): TripAggregate {
    return {
      distanceKm: Number(trip.distanceKm),
      durationSec: trip.durationSec,
      movingSec: trip.movingSec,
      idleSec: trip.idleSec,
      stopCount: trip.stopCount,
      maxSpeedKph: trip.maxSpeedKph,
      harshAccelCount: trip.harshAccelCount,
      harshBrakeCount: trip.harshBrakeCount,
      harshCornerCount: trip.harshCornerCount,
      speedingCount: trip.speedingCount,
      pointCount: trip.pointCount,
      endLat: trip.endLat ?? 0,
      endLng: trip.endLng ?? 0,
      endOdometerKm: trip.endOdometerKm,
    };
  }
}
