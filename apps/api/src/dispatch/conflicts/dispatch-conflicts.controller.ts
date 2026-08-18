import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { DispatchConflictsService } from "./dispatch-conflicts.service";
import { BatchDispatchConflictsDto } from "./dto/batch-dispatch-conflicts.dto";
import { CheckDispatchConflictsDto } from "./dto/check-dispatch-conflicts.dto";

const ROLES_READ: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT"];
const ROLES_WRITE: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("dispatches")
export class DispatchConflictsController {
  constructor(private readonly conflictsService: DispatchConflictsService) {}

  @Roles(...ROLES_READ)
  @Post("conflicts/batch")
  batch(@Body() dto: BatchDispatchConflictsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.conflictsService.batchConflicts(user.organizationId, dto.ids);
  }

  @Roles(...ROLES_READ)
  @Get(":id/conflicts")
  list(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.conflictsService.getConflicts(user.organizationId, id);
  }

  @Roles(...ROLES_READ)
  @Post(":id/check-conflicts")
  check(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CheckDispatchConflictsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.conflictsService.checkConflicts(user.organizationId, id, dto, user);
  }

  @Roles(...ROLES_WRITE)
  @Post(":id/conflicts/:conflictId/ignore")
  ignore(
    @Param("id", ParseUUIDPipe) id: string,
    // conflictId is the engine's stable sha256-derived key (dispatch-conflict.engine.ts),
    // not a UUID — it must not go through ParseUUIDPipe.
    @Param("conflictId") conflictId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.conflictsService.ignoreConflict(user.organizationId, id, conflictId, user);
  }

  @Roles(...ROLES_WRITE)
  @Post(":id/conflicts/:conflictId/resolve")
  resolve(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("conflictId") conflictId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.conflictsService.resolveConflict(user.organizationId, id, conflictId, user);
  }
}
