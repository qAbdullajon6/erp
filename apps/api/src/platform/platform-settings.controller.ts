import { Body, Controller, Get, Patch, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PlatformSettingsService } from "./platform-settings.service";
import { FindStaffQueryDto, SetPlatformAdminDto } from "./dto/settings.dto";

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("platform/settings")
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get("staff")
  listStaff() {
    return this.settings.listStaff();
  }

  @Get("staff/lookup")
  lookup(@Query() query: FindStaffQueryDto) {
    return this.settings.findByEmail(query.email);
  }

  @Patch("staff")
  setPlatformAdmin(@Body() dto: SetPlatformAdminDto, @CurrentUser() user: CurrentUserPayload) {
    return this.settings.setPlatformAdmin(dto.userId, dto.isPlatformAdmin, user);
  }
}
