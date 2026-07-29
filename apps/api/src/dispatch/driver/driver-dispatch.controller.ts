import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { UpdateDispatchStatusDto } from "../dto/update-dispatch-status.dto";
import { DriverDispatchService } from "./driver-dispatch.service";
import { DriverWorkspaceService } from "./driver-workspace.service";
import { ArrivalLocationDto, UpdatePodMetaDto } from "./dto/driver-workspace.dto";
import { RejectDispatchDto } from "./dto/reject-dispatch.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("DRIVER")
@Controller("dispatches/my")
export class DriverDispatchController {
  constructor(
    private readonly driverDispatches: DriverDispatchService,
    private readonly workspace: DriverWorkspaceService,
  ) {}

  @Get()
  listMine(
    @CurrentUser() user: CurrentUserPayload,
    @Query("includeFinished") includeFinished?: string,
  ) {
    return this.driverDispatches.listMine(
      user.organizationId,
      user.userId,
      includeFinished === "true",
    );
  }

  @Get(":id/proofs")
  listProofs(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.workspace.listProofs(user.organizationId, user.userId, id);
  }

  @Post(":id/proofs/photo")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8_000_000 } }))
  uploadPhoto(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workspace.uploadProof(user.organizationId, user.userId, id, "PHOTO", file);
  }

  @Post(":id/proofs/signature")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 4_000_000 } }))
  uploadSignature(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workspace.uploadProof(user.organizationId, user.userId, id, "SIGNATURE", file);
  }

  @Post(":id/proofs/meta")
  updatePodMeta(
    @Param("id") id: string,
    @Body() dto: UpdatePodMetaDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workspace.updatePodMeta(user.organizationId, user.userId, id, dto);
  }

  @Post(":id/accept")
  accept(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.driverDispatches.accept(user.organizationId, user.userId, id, user);
  }

  @Post(":id/reject")
  reject(
    @Param("id") id: string,
    @Body() dto: RejectDispatchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.driverDispatches.reject(user.organizationId, user.userId, id, dto, user);
  }

  @Get(":id")
  getMine(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.driverDispatches.getMine(user.organizationId, user.userId, id);
  }

  @Post(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateDispatchStatusDto & ArrivalLocationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { lat, lng, ...statusDto } = dto;
    return this.driverDispatches.updateStatus(
      user.organizationId,
      user.userId,
      id,
      statusDto,
      user,
      { lat, lng },
    );
  }
}
