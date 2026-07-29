import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { InvitationModule } from "../invitations/invitation.module";
import { LeadTimelineModule } from "../leads/lead-timeline.module";
import { PlatformOrganizationsController } from "./platform-organizations.controller";
import { PlatformOrganizationsService } from "./platform-organizations.service";
import { PlatformSearchController } from "./platform-search.controller";
import { PlatformSearchService } from "./platform-search.service";
import { PlatformAnalyticsController } from "./platform-analytics.controller";
import { PlatformAnalyticsService } from "./platform-analytics.service";
import { PlatformSubscriptionsController } from "./platform-subscriptions.controller";
import { PlatformSubscriptionsService } from "./platform-subscriptions.service";
import { PlatformNotificationsController } from "./platform-notifications.controller";
import { PlatformNotificationsService } from "./platform-notifications.service";
import { PlatformSupportController } from "./platform-support.controller";
import { PlatformSupportService } from "./platform-support.service";
import { PlatformAuditController } from "./platform-audit.controller";
import { PlatformAuditService } from "./platform-audit.service";
import { PlatformSystemController } from "./platform-system.controller";
import { PlatformSystemService } from "./platform-system.service";
import { PlatformSettingsController } from "./platform-settings.controller";
import { PlatformSettingsService } from "./platform-settings.service";
import { PlatformDashboardController } from "./platform-dashboard.controller";
import { PlatformDashboardService } from "./platform-dashboard.service";
import { PlatformLeadsController } from "./platform-leads.controller";
import { PlatformLeadsService } from "./platform-leads.service";

@Module({
  imports: [AuthModule, AuditModule, BillingModule, InvitationModule, LeadTimelineModule],
  controllers: [
    PlatformDashboardController,
    PlatformOrganizationsController,
    PlatformSearchController,
    PlatformAnalyticsController,
    PlatformSubscriptionsController,
    PlatformNotificationsController,
    PlatformSupportController,
    PlatformAuditController,
    PlatformSystemController,
    PlatformSettingsController,
    PlatformLeadsController,
  ],
  providers: [
    PlatformDashboardService,
    PlatformOrganizationsService,
    PlatformSearchService,
    PlatformAnalyticsService,
    PlatformSubscriptionsService,
    PlatformNotificationsService,
    PlatformSupportService,
    PlatformAuditService,
    PlatformSystemService,
    PlatformSettingsService,
    PlatformLeadsService,
  ],
  exports: [PlatformNotificationsService],
})
export class PlatformModule {}
