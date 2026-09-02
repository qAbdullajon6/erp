import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import type { AuthConfig } from "../config/configuration";
import { AuditModule } from "../audit/audit.module";
import { WorkflowsModule } from "../workflows/workflows.module";

import { TelematicsAnalyticsService } from "./analytics/telematics-analytics.service";
import { AlertService } from "./alerts/alert.service";
import { DeviceService } from "./devices/device.service";
import { GeofenceService } from "./geofences/geofence.service";
import { GeofenceEventService } from "./geofences/geofence-event.service";
import { IngestionService } from "./ingestion/ingestion.service";
import { ManualProvider } from "./providers/manual.provider";
import { TraccarProvider } from "./providers/traccar.provider";
import { SamsaraProvider } from "./providers/samsara.provider";
import { GeotabProvider } from "./providers/geotab.provider";
import { ProviderRegistry } from "./providers/provider-registry";
import { TelematicsRealtimeService } from "./realtime/telematics-realtime.service";
import { TelematicsSettingsService } from "./settings/telematics-settings.service";
import { TripService } from "./trips/trip.service";
import { TelematicsSweeperService } from "./workers/telematics-sweeper.service";

import { TelematicsService } from "./telematics.service";
import { TelematicsController } from "./telematics.controller";
import { TelematicsIngestController } from "./telematics-ingest.controller";
import { TripsController } from "./trips.controller";
import { GeofencesController } from "./geofences.controller";
import { TelematicsAlertsController } from "./telematics-alerts.controller";
import { TelematicsDevicesController } from "./telematics-devices.controller";
import { TelematicsAdminController } from "./telematics-admin.controller";
import { TrackingController } from "./tracking/tracking.controller";
import { TrackingMapController } from "./tracking/tracking-map.controller";
import { TrackingDevController } from "./tracking/tracking-dev.controller";
import { TrackingDebugController } from "./debug/tracking-debug.controller";
import { TrackingService } from "./tracking/tracking.service";
import { TrackingDebugBufferService } from "./debug/tracking-debug-buffer.service";
import { TrackingDebugService } from "./debug/tracking-debug.service";
import { MapboxService } from "./mapbox/mapbox.service";

const isDevelopment = process.env.NODE_ENV === "development";

/// Fleet Telematics & GPS Tracking.
///
/// Depends inward only: it consumes Audit and the Workflows event bus (so its
/// alerts and trips fan out to workflows and webhooks), and nothing in those
/// modules knows telematics exists.
///
/// TrackingService is the Phase 1 foundation facade for GPS receive, live
/// position reads, bounded history, and TrackingSession heartbeat presence.
/// Existing `/telematics/*` routes remain backward-compatible; `/tracking/*`
/// is the additive production surface.
///
/// Every provider and service is a plain NestJS provider — no dynamic wiring —
/// and the two background actors (the realtime Redis subscriber and the
/// sweeper) manage their own lifecycles via OnModuleInit/Destroy, matching
/// WorkflowSchedulerService.
@Module({
  imports: [
    AuditModule,
    WorkflowsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const auth = config.get<AuthConfig>("auth")!;
        return { secret: auth.jwtAccessSecret };
      },
    }),
  ],
  controllers: [
    TelematicsController,
    TelematicsIngestController,
    TrackingController,
    TrackingMapController,
    TripsController,
    GeofencesController,
    TelematicsAlertsController,
    TelematicsDevicesController,
    TelematicsAdminController,
    // Phase 10 simulate + Phase 11 debug console — development only.
    ...(isDevelopment ? [TrackingDevController, TrackingDebugController] : []),
  ],
  providers: [
    // Core services
    TelematicsService,
    TrackingService,
    TrackingDebugBufferService,
    TrackingDebugService,
    MapboxService,
    IngestionService,
    TripService,
    GeofenceService,
    GeofenceEventService,
    AlertService,
    DeviceService,
    TelematicsSettingsService,
    TelematicsAnalyticsService,
    // Realtime
    TelematicsRealtimeService,
    // Providers
    ManualProvider,
    TraccarProvider,
    SamsaraProvider,
    GeotabProvider,
    ProviderRegistry,
    // Workers
    TelematicsSweeperService,
  ],
  // Exported so the AI copilot tools, the public API, the customer portal and
  // reporting can reuse the exact same services the HTTP controllers use.
  exports: [
    TelematicsService,
    TrackingService,
    TelematicsAnalyticsService,
    AlertService,
    GeofenceService,
    TripService,
    MapboxService,
  ],
})
export class TelematicsModule {}
