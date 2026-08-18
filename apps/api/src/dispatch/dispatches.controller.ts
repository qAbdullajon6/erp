import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { RawResponse } from "../common/decorators/raw-response.decorator";
import { DispatchesService } from "./dispatches.service";
import { CreateDispatchDto } from "./dto/create-dispatch.dto";
import { ListDispatchesQueryDto } from "./dto/list-dispatches-query.dto";
import { UpdateDispatchDto } from "./dto/update-dispatch.dto";
import { UpdateDispatchStatusDto } from "./dto/update-dispatch-status.dto";
import { RescheduleDispatchDto } from "./dto/reschedule-dispatch.dto";

/// "ACCOUNTANT: read-only orders and dispatch" per the phase spec;
/// DISPATCHER gets full create/manage access.
const ROLES_READ: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT"];
/// Matches OrdersController.OPERATIONAL_ROLES and DISPATCH_API.md — OPS managers
/// run the same day-of fulfillment path as dispatchers (assign / status / cancel).
const ROLES_WRITE: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("dispatches")
export class DispatchesController {
  constructor(private readonly dispatchesService: DispatchesService) {}

  @Roles(...ROLES_READ)
  @Get()
  list(
    @Query() query: ListDispatchesQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.list(user.organizationId, query);
  }

  @Roles(...ROLES_READ)
  @Get(":id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.getById(user.organizationId, id);
  }

  /// Admin/ops read of driver-submitted Proof of Delivery — never exposes the
  /// underlying file path, only metadata; images/signature stream through
  /// getProofFile below, gated by the same ROLES_READ + org/dispatch scoping.
  @Roles(...ROLES_READ)
  @Get(":id/proof-of-delivery")
  getProofOfDelivery(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.getProofOfDelivery(user.organizationId, id);
  }

  /// Binary body, not a JSON document — the global TransformInterceptor
  /// wraps every response in `{ data: ... }`, which would serialize this
  /// StreamableFile into JSON text instead of streaming its bytes.
  @Roles(...ROLES_READ)
  @Get(":id/proof-of-delivery/:proofId/file")
  @RawResponse()
  async getProofFile(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("proofId", ParseUUIDPipe) proofId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, mimeType, fileName } = await this.dispatchesService.getProofFile(
      user.organizationId,
      id,
      proofId,
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    return file;
  }

  @Roles(...ROLES_WRITE)
  @Post()
  create(
    @Body() dto: CreateDispatchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.create(user.organizationId, dto, user);
  }

  @Roles(...ROLES_WRITE)
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDispatchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.update(user.organizationId, id, dto, user);
  }

  @Roles(...ROLES_WRITE)
  @Post(":id/reschedule")
  reschedule(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RescheduleDispatchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.reschedule(user.organizationId, id, dto, user);
  }

  @Roles(...ROLES_WRITE)
  @Post(":id/status")
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDispatchStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.updateStatus(user.organizationId, id, dto, user);
  }

  /// Board / accidental status-move recovery. Reverts the latest history step
  /// (forward-only R13 cannot express "go back" via POST /status).
  @Roles(...ROLES_WRITE)
  @Post(":id/undo-status")
  undoStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.undoStatus(user.organizationId, id, user);
  }

  @Roles(...ROLES_WRITE)
  @Post(":id/cancel")
  cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.cancel(user.organizationId, id, user);
  }
}
