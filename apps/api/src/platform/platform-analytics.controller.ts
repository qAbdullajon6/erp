import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { PlatformAnalyticsService } from "./platform-analytics.service";

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("platform/analytics")
export class PlatformAnalyticsController {
  constructor(private readonly analytics: PlatformAnalyticsService) {}

  @Get()
  overview() {
    return this.analytics.overview();
  }
}
