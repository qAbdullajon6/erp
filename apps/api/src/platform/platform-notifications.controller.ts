import { Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { PlatformNotificationsService } from "./platform-notifications.service";

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("platform/notifications")
export class PlatformNotificationsController {
  constructor(private readonly notifications: PlatformNotificationsService) {}

  @Get()
  list() {
    return this.notifications.list();
  }

  @Patch(":id/read")
  markRead(@Param("id") id: string) {
    return this.notifications.markRead(id);
  }

  @Post("read-all")
  markAllRead() {
    return this.notifications.markAllRead();
  }
}
