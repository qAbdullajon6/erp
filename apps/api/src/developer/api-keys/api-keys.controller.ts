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
  UseGuards,
} from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { ApiKeysService } from "./api-keys.service";
import { CreateApiKeyDto, UpdateApiKeyDto } from "./dto/api-key.dto";

/// Who may administer integration credentials. Intentionally narrower than
/// the read-roles other modules use: an API key is a bearer credential for
/// the whole organization's data, so minting one is an admin-level act, not
/// an operational one. Mirrored by ADMIN_OPS_ROLES on the route guard in
/// apps/web/src/routes/app.developer.tsx.
const API_KEY_ADMIN_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER"];

/// Session-authenticated management surface for API keys. Note this is
/// guarded by JwtAuthGuard — an API key cannot be used to mint another API
/// key, which keeps a leaked key from bootstrapping itself into persistence.
@Controller("admin/api-keys")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...API_KEY_ADMIN_ROLES)
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.organizationId);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateApiKeyDto) {
    return this.service.create(user, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateApiKeyDto,
  ) {
    return this.service.update(user, id, dto);
  }

  /// Terminal. Returns the revoked key rather than 204 so the client can
  /// render the new state without a refetch.
  @Delete(":id")
  @HttpCode(200)
  revoke(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.revoke(user, id);
  }

  @Post(":id/rotate")
  @HttpCode(200)
  rotate(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.rotate(user, id);
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
}
