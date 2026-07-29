import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { DriverWorkspaceService } from "../dispatch/driver/driver-workspace.service";
import {
  CreateDriverExpenseDto,
  CreateDriverFuelDto,
  CreateVehicleInspectionDto,
  UpdateOperationalStatusDto,
} from "../dispatch/driver/dto/driver-workspace.dto";

/// DRIVER-only workspace endpoints under /drivers/me/* (must be registered
/// before DriversController `:id` routes — DriversModule imports this first).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("DRIVER")
@Controller("drivers/me")
export class DriverMeController {
  constructor(private readonly workspace: DriverWorkspaceService) {}

  @Get()
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.workspace.getMe(user.organizationId, user.userId);
  }

  @Get("notifications")
  listNotifications(@CurrentUser() user: CurrentUserPayload) {
    return this.workspace.listMyNotifications(user.organizationId, user.userId);
  }

  @Post("notifications/:id/read")
  markNotificationRead(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workspace.markNotificationRead(user.organizationId, user.userId, id);
  }

  @Post("operational-status")
  updateOperationalStatus(
    @Body() dto: UpdateOperationalStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workspace.updateOperationalStatus(user.organizationId, user.userId, dto);
  }

  @Post("breaks/start")
  startBreak(@CurrentUser() user: CurrentUserPayload) {
    return this.workspace.startBreak(user.organizationId, user.userId);
  }

  @Post("breaks/end")
  endBreak(@CurrentUser() user: CurrentUserPayload) {
    return this.workspace.endBreak(user.organizationId, user.userId);
  }

  @Get("expenses")
  listExpenses(@CurrentUser() user: CurrentUserPayload) {
    return this.workspace.listMyExpenses(user.organizationId, user.userId);
  }

  @Post("expenses")
  createExpense(@Body() dto: CreateDriverExpenseDto, @CurrentUser() user: CurrentUserPayload) {
    return this.workspace.createExpense(user.organizationId, user.userId, dto, user);
  }

  @Post("expenses/fuel")
  createFuel(@Body() dto: CreateDriverFuelDto, @CurrentUser() user: CurrentUserPayload) {
    return this.workspace.createFuel(user.organizationId, user.userId, dto, user);
  }

  @Post("expenses/:id/receipt")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8_000_000 } }))
  uploadReceipt(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workspace.uploadExpenseReceipt(user.organizationId, user.userId, id, file);
  }

  @Delete("expenses/:id/receipt")
  deleteReceipt(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.workspace.deleteExpenseReceipt(user.organizationId, user.userId, id);
  }

  @Get("expenses/:id/receipt")
  async getReceipt(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, mimeType, fileName } = await this.workspace.getExpenseReceiptFile(
      user.organizationId,
      user.userId,
      id,
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    return file;
  }

  @Get("inspections")
  listInspections(@CurrentUser() user: CurrentUserPayload) {
    return this.workspace.listMyInspections(user.organizationId, user.userId);
  }

  @Get("inspections/:id")
  getInspection(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.workspace.getMyInspection(user.organizationId, user.userId, id);
  }

  @Post("inspections")
  createInspection(
    @Body() dto: CreateVehicleInspectionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workspace.createInspection(user.organizationId, user.userId, dto);
  }

  @Post("inspections/:id/photos")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8_000_000 } }))
  uploadInspectionPhoto(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workspace.uploadInspectionPhoto(user.organizationId, user.userId, id, file);
  }

  @Get("inspections/:inspectionId/photos/:photoId")
  async getInspectionPhoto(
    @Param("inspectionId", ParseUUIDPipe) inspectionId: string,
    @Param("photoId", ParseUUIDPipe) photoId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, mimeType, fileName } = await this.workspace.getInspectionPhotoFile(
      user.organizationId,
      user.userId,
      inspectionId,
      photoId,
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    return file;
  }
}
