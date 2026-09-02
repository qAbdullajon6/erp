import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe,
  Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { MembershipRole } from "@prisma/client";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { RawResponse } from "../common/decorators/raw-response.decorator";
import { DriverDocumentsService, MAX_DOC_BYTES } from "./driver-documents.service";
import { CreateDriverDocumentDto } from "./dto/create-driver-document.dto";
import { RejectDriverDocumentDto } from "./dto/reject-driver-document.dto";
import { UpdateDriverDocumentDto } from "./dto/update-driver-document.dto";

const READ_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];
const WRITE_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("drivers/:driverId/documents")
export class DriverDocumentsController {
  constructor(private readonly service: DriverDocumentsService) {}

  @Roles(...READ_ROLES)
  @Get()
  list(
    @Param("driverId", ParseUUIDPipe) driverId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.list(user.organizationId, driverId);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(
    @Param("driverId", ParseUUIDPipe) driverId: string,
    @Body() dto: CreateDriverDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(user.organizationId, driverId, dto, user);
  }

  @Roles(...WRITE_ROLES)
  @Patch(":docId")
  update(
    @Param("driverId", ParseUUIDPipe) driverId: string,
    @Param("docId", ParseUUIDPipe) docId: string,
    @Body() dto: UpdateDriverDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(user.organizationId, driverId, docId, dto, user);
  }

  @Roles(...WRITE_ROLES)
  @Post(":docId/file")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MAX_DOC_BYTES } }))
  uploadFile(
    @Param("driverId", ParseUUIDPipe) driverId: string,
    @Param("docId", ParseUUIDPipe) docId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.uploadFile(user.organizationId, driverId, docId, file, user);
  }

  @Roles(...READ_ROLES)
  @Get(":docId/file")
  @RawResponse()
  async serveFile(
    @Param("driverId", ParseUUIDPipe) driverId: string,
    @Param("docId", ParseUUIDPipe) docId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ) {
    const { mimeType, fileName, stream } = await this.service.serveFile(user.organizationId, driverId, docId);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    stream.pipe(res);
  }

  @Roles(...WRITE_ROLES)
  @Delete(":docId/file")
  @HttpCode(200)
  removeFile(
    @Param("driverId", ParseUUIDPipe) driverId: string,
    @Param("docId", ParseUUIDPipe) docId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removeFile(user.organizationId, driverId, docId, user);
  }

  @Roles("ADMIN", "OPERATIONS_MANAGER")
  @Post(":docId/verify")
  @HttpCode(200)
  verify(
    @Param("driverId", ParseUUIDPipe) driverId: string,
    @Param("docId", ParseUUIDPipe) docId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.verify(user.organizationId, driverId, docId, user);
  }

  @Roles("ADMIN", "OPERATIONS_MANAGER")
  @Post(":docId/reject")
  @HttpCode(200)
  reject(
    @Param("driverId", ParseUUIDPipe) driverId: string,
    @Param("docId", ParseUUIDPipe) docId: string,
    @Body() dto: RejectDriverDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.reject(user.organizationId, driverId, docId, dto.reason, user);
  }

  @Roles(...WRITE_ROLES)
  @Delete(":docId")
  @HttpCode(200)
  remove(
    @Param("driverId", ParseUUIDPipe) driverId: string,
    @Param("docId", ParseUUIDPipe) docId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(user.organizationId, driverId, docId, user);
  }
}
