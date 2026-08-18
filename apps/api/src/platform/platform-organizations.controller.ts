import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PlatformOrganizationsService } from "./platform-organizations.service";
import {
  ListPlatformOrganizationsQueryDto,
  UpdateOrganizationStatusDto,
} from "./dto/list-organizations.dto";

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("platform/organizations")
export class PlatformOrganizationsController {
  constructor(private readonly organizations: PlatformOrganizationsService) {}

  @Get()
  list(@Query() query: ListPlatformOrganizationsQueryDto) {
    return this.organizations.list(query);
  }

  /// Static path before `:id` so Nest does not treat "support" as an id.
  @Post("support/exit")
  exit(@CurrentUser() user: CurrentUserPayload) {
    return this.organizations.exitSupport(user);
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.organizations.getById(id);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateOrganizationStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.organizations.updateStatus(id, dto.status, user);
  }

  @Post(":id/enter")
  enter(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.organizations.enterOrganization(id, user);
  }
}
