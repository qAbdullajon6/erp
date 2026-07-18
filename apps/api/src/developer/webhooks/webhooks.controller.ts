import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { WebhooksService } from "./webhooks.service";
import { CreateWebhookDto, TestWebhookDto, UpdateWebhookDto, WEBHOOK_EVENTS } from "./dto/webhook.dto";

/// Same reasoning as API_KEY_ADMIN_ROLES: a webhook exfiltrates this
/// organization's domain events to an arbitrary URL, so pointing one is an
/// admin-level act.
const WEBHOOK_ADMIN_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER"];

@Controller("admin/webhooks")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...WEBHOOK_ADMIN_ROLES)
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.organizationId);
  }

  /// Static route, declared before `:id` so "events" is never parsed as an id.
  @Get("events")
  listEvents() {
    return { items: WEBHOOK_EVENTS };
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateWebhookDto) {
    return this.service.create(user, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(user.organizationId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.remove(user, id);
  }

  @Post(":id/enable")
  @HttpCode(200)
  enable(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.setEnabled(user, id, true);
  }

  @Post(":id/disable")
  @HttpCode(200)
  disable(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.setEnabled(user, id, false);
  }

  @Post(":id/rotate-secret")
  @HttpCode(200)
  rotateSecret(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.rotateSecret(user, id);
  }

  @Post(":id/test")
  @HttpCode(200)
  test(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TestWebhookDto,
  ) {
    return this.service.test(user, id, dto.event);
  }

  @Get(":id/deliveries")
  listDeliveries(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: Record<string, string>,
  ) {
    return this.service.listDeliveries(user.organizationId, id, {
      limit: query.limit ? Number(query.limit) : undefined,
      status: query.status,
    });
  }

  @Get(":id/deliveries/:deliveryId")
  getDelivery(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
  ) {
    return this.service.getDelivery(user.organizationId, id, deliveryId);
  }

  @Post(":id/deliveries/:deliveryId/replay")
  @HttpCode(200)
  replayDelivery(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
  ) {
    return this.service.replayDelivery(user, id, deliveryId);
  }

  @Post(":id/deliveries/:deliveryId/retry")
  @HttpCode(200)
  retryDelivery(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
  ) {
    return this.service.retryDelivery(user, id, deliveryId);
  }
}
