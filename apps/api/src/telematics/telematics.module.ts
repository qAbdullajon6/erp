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

/// Fleet Telematics & GPS Tracking.
///
/// Depends inward only: it consumes Audit and the Workflows event bus (so its
/// alerts and trips fan out to workflows and webhooks), and nothing in those
/// modules knows telematics exists. JwtModule is registered locally with the
/// same access secret the auth module uses, so the WebSocket gateway can verify
/// a token on the handshake without reaching into AuthModule internals.
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
    TripsController,
    GeofencesController,
    TelematicsAlertsController,
    TelematicsDevicesController,
    TelematicsAdminController,
  ],
  providers: [
    // Core services
    TelematicsService,
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
  exports: [TelematicsService, TelematicsAnalyticsService, AlertService, GeofenceService, TripService],
})
export class TelematicsModule {}
