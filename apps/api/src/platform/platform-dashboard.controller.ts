import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { PlatformDashboardService } from "./platform-dashboard.service";

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("platform/dashboard")
export class PlatformDashboardController {
  constructor(private readonly dashboard: PlatformDashboardService) {}

  @Get()
  summary() {
    return this.dashboard.summary();
  }
}
