import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PlatformSupportService } from "./platform-support.service";
import {
  CreateSupportTicketDto,
  ListSupportTicketsQueryDto,
  UpdateSupportTicketDto,
} from "./dto/support-ticket.dto";

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("platform/support")
export class PlatformSupportController {
  constructor(private readonly support: PlatformSupportService) {}

  @Get()
  list(@Query() query: ListSupportTicketsQueryDto) {
    return this.support.list(query);
  }

  @Post()
  create(@Body() dto: CreateSupportTicketDto, @CurrentUser() user: CurrentUserPayload) {
    return this.support.create(dto, user);
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.support.getById(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateSupportTicketDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.support.update(id, dto, user);
  }
}
