import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AlertService } from "../alerts/alert.service";
import { TelematicsRealtimeService } from "../realtime/telematics-realtime.service";
import { TripService } from "../trips/trip.service";

/// The time-based side of telematics that no incoming ping can trigger:
///   - OFFLINE detection: a device that stops reporting produces no event, so
///     only a clock can notice it has gone quiet.
///   - Trip auto-close: a vehicle that parks and never sends "ignition off"
///     leaves its trip open; the sweeper closes it once it has been stationary
///     past the org's threshold.
///   - Retention: the raw position stream is unbounded by nature, so old fixes
///     are pruned to the org's retention window.
///
/// Built on setInterval, matching WorkflowSchedulerService — this repo has no
/// @nestjs/schedule dependency, and a single 60s tick is all this needs.
/// Retention runs on a slower cadence because pruning is heavier and far less
/// time-sensitive than offline detection.
@Injectable()
export class TelematicsSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelematicsSweeperService.name);
  private handle: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private running = false;

  /// Prune once an hour (60 one-minute ticks), not every tick.
  private static readonly RETENTION_EVERY_TICKS = 60;
  private static readonly TICK_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripService,
    private readonly alerts: AlertService,
    private readonly realtime: TelematicsRealtimeService,
  ) {}

  onModuleInit() {
    // Disabled under tests so the interval doesn't leak across the suite.
    if (process.env.NODE_ENV === "test") return;
    this.handle = setInterval(() => void this.tick(), TelematicsSweeperService.TICK_MS);
    this.logger.log("Telematics sweeper started (60s interval)");
  }

  onModuleDestroy() {
    if (this.handle) clearInterval(this.handle);
    this.handle = null;
  }

  /// Public so an e2e/integration test can drive one pass deterministically
  /// instead of waiting on the interval.
  async tick(): Promise<void> {
    if (this.running) return; // never overlap a slow tick with the next one
    this.running = true;
    try {
      const settingsRows = await this.prisma.telematicsSettings.findMany();
      for (const settings of settingsRows) {
        await this.detectOffline(settings.organizationId, settings.offlineThresholdSec, settings.offlineAlertsEnabled);
        await this.autoCloseTrips(settings.organizationId, settings.tripAutoCloseSec);
      }

      this.tickCount += 1;
      if (this.tickCount % TelematicsSweeperService.RETENTION_EVERY_TICKS === 0) {
        for (const settings of settingsRows) {
          if (settings.retentionDays > 0) {
            await this.pruneRetention(settings.organizationId, settings.retentionDays);
          }
        }
      }
    } catch (err) {
      this.logger.error(`Sweeper tick failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.running = false;
    }
  }

  private async detectOffline(organizationId: string, offlineThresholdSec: number, alertsEnabled: boolean): Promise<void> {
    const cutoff = new Date(Date.now() - offlineThresholdSec * 1000);
    const stale = await this.prisma.vehicleTelematicsState.findMany({
      where: {
        organizationId,
        movementState: { not: "OFFLINE" },
        lastReceivedAt: { lt: cutoff },
      },
    });
    if (stale.length === 0) return;

    for (const state of stale) {
      await this.prisma.vehicleTelematicsState.update({
        where: { vehicleId: state.vehicleId },
        data: { movementState: "OFFLINE" },
      });
      this.realtime.publish(organizationId, {
        type: "state",
        vehicleId: state.vehicleId,
        at: new Date().toISOString(),
        payload: { vehicleId: state.vehicleId, movementState: "OFFLINE", latitude: state.latitude, longitude: state.longitude },
      });
      if (alertsEnabled) {
        const vehicle = await this.prisma.vehicle.findUnique({ where: { id: state.vehicleId }, select: { vehicleCode: true, plateNumber: true } });
        const label = vehicle?.plateNumber || vehicle?.vehicleCode || state.vehicleId;
        await this.alerts.raise({
          organizationId,
          type: "DEVICE_OFFLINE",
          severity: "MEDIUM",
          vehicleId: state.vehicleId,
          title: `${label} has gone offline`,
          message: `No GPS fix from ${label} for over ${Math.round(offlineThresholdSec / 60)} min.`,
          latitude: state.latitude,
          longitude: state.longitude,
          occurredAt: new Date(),
          dedupeKey: `offline:${state.vehicleId}`,
        });
      }
    }
  }

  private async autoCloseTrips(organizationId: string, tripAutoCloseSec: number): Promise<void> {
    const cutoff = new Date(Date.now() - tripAutoCloseSec * 1000);
    const active = await this.prisma.trip.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { id: true, vehicleId: true, endLat: true, endLng: true, endOdometerKm: true },
    });
    if (active.length === 0) return;

    for (const trip of active) {
      const state = await this.prisma.vehicleTelematicsState.findUnique({
        where: { vehicleId: trip.vehicleId },
        select: { lastRecordedAt: true, movementState: true, latitude: true, longitude: true, stationarySince: true, odometerKm: true },
      });
      // Close when the vehicle hasn't reported recently, OR has been stationary
      // (stopped/idling) since before the cutoff.
      const noRecentData = !state?.lastRecordedAt || state.lastRecordedAt < cutoff;
      const stationaryLongEnough =
        state?.movementState !== "MOVING" && state?.stationarySince != null && state.stationarySince < cutoff;

      if (noRecentData || stationaryLongEnough) {
        await this.trips.close(organizationId, trip.id, {
          at: state?.lastRecordedAt ?? new Date(),
          lat: state?.latitude ?? trip.endLat ?? 0,
          lng: state?.longitude ?? trip.endLng ?? 0,
          odometerKm: state?.odometerKm ?? trip.endOdometerKm ?? null,
          autoClosed: true,
        });
        // Detach the closed trip from the live state so a future move opens a new one.
        await this.prisma.vehicleTelematicsState
          .update({ where: { vehicleId: trip.vehicleId }, data: { tripId: null } })
          .catch(() => undefined);
      }
    }
  }

  private async pruneRetention(organizationId: string, retentionDays: number): Promise<void> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.gpsPosition.deleteMany({
      where: { organizationId, recordedAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(`Pruned ${result.count} gps_positions older than ${retentionDays}d for org ${organizationId}`);
    }
  }
}
