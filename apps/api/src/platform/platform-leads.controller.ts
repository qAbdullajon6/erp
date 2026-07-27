import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PlatformLeadsService } from "./platform-leads.service";

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("platform/leads")
export class PlatformLeadsController {
  constructor(private readonly leads: PlatformLeadsService) {}

  @Post(":id/convert")
  convert(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.leads.convert(id, user);
  }
}
