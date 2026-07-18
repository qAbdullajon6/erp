import { Injectable } from "@nestjs/common";
import type { TelematicsSettings } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { UpdateTelematicsSettingsDto } from "../dto/update-telematics-settings.dto";

/// Per-organization telematics thresholds. Lazily created with schema defaults
/// on first access — same pattern as NotificationSettings — so a brand-new org
/// tracks vehicles immediately without a provisioning step, and an ops manager
/// can tune sensitivity later without a deploy.
///
/// A tiny in-process cache keeps the ingestion hot path from reading this row
/// on every single GPS ping. It is invalidated on update, and is per-instance
/// (a settings change propagates to other instances within CACHE_TTL_MS) —
/// acceptable because thresholds are advisory and change rarely.
@Injectable()
export class TelematicsSettingsService {
  private static readonly CACHE_TTL_MS = 30_000;
  private readonly cache = new Map<string, { value: TelematicsSettings; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(organizationId: string): Promise<TelematicsSettings> {
    const cached = this.cache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const existing = await this.prisma.telematicsSettings.findUnique({ where: { organizationId } });
    const value =
      existing ??
      (await this.prisma.telematicsSettings.create({ data: { organizationId } }));

    this.cache.set(organizationId, { value, expiresAt: Date.now() + TelematicsSettingsService.CACHE_TTL_MS });
    return value;
  }

  async get(organizationId: string) {
    return this.toResponse(await this.getOrCreate(organizationId));
  }

  async update(organizationId: string, dto: UpdateTelematicsSettingsDto) {
    await this.getOrCreate(organizationId);
    const updated = await this.prisma.telematicsSettings.update({
      where: { organizationId },
      data: {
        speedLimitKph: dto.speedLimitKph,
        speedingToleranceKph: dto.speedingToleranceKph,
        idleThresholdSec: dto.idleThresholdSec,
        stopThresholdSec: dto.stopThresholdSec,
        offlineThresholdSec: dto.offlineThresholdSec,
        harshAccelMs2: dto.harshAccelMs2,
        harshBrakeMs2: dto.harshBrakeMs2,
        harshCornerMs2: dto.harshCornerMs2,
        tripAutoCloseSec: dto.tripAutoCloseSec,
        lowFuelThresholdPct: dto.lowFuelThresholdPct,
        retentionDays: dto.retentionDays,
        speedingAlertsEnabled: dto.speedingAlertsEnabled,
        idleAlertsEnabled: dto.idleAlertsEnabled,
        geofenceAlertsEnabled: dto.geofenceAlertsEnabled,
        harshDrivingAlertsEnabled: dto.harshDrivingAlertsEnabled,
        offlineAlertsEnabled: dto.offlineAlertsEnabled,
        healthAlertsEnabled: dto.healthAlertsEnabled,
      },
    });
    this.cache.delete(organizationId);
    return this.toResponse(updated);
  }

  private toResponse(s: TelematicsSettings) {
    return {
      speedLimitKph: s.speedLimitKph,
      speedingToleranceKph: s.speedingToleranceKph,
      idleThresholdSec: s.idleThresholdSec,
      stopThresholdSec: s.stopThresholdSec,
      offlineThresholdSec: s.offlineThresholdSec,
      harshAccelMs2: s.harshAccelMs2,
      harshBrakeMs2: s.harshBrakeMs2,
      harshCornerMs2: s.harshCornerMs2,
      tripAutoCloseSec: s.tripAutoCloseSec,
      lowFuelThresholdPct: s.lowFuelThresholdPct,
      retentionDays: s.retentionDays,
      speedingAlertsEnabled: s.speedingAlertsEnabled,
      idleAlertsEnabled: s.idleAlertsEnabled,
      geofenceAlertsEnabled: s.geofenceAlertsEnabled,
      harshDrivingAlertsEnabled: s.harshDrivingAlertsEnabled,
      offlineAlertsEnabled: s.offlineAlertsEnabled,
      healthAlertsEnabled: s.healthAlertsEnabled,
      updatedAt: s.updatedAt,
    };
  }
}
