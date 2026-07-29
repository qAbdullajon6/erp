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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Response } from "express";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { RawResponse } from "../common/decorators/raw-response.decorator";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { CheckDuplicateOrderDto } from "./dto/check-duplicate-order.dto";
import { AssignOrderDto } from "./dto/assign-order.dto";
import { CancelOrderDto } from "./dto/cancel-order.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { CreateOrderNoteDto } from "./dto/create-order-note.dto";
import { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { UploadOrderDocumentDto } from "./dto/upload-order-document.dto";
import { RenameOrderDocumentDto } from "./dto/rename-order-document.dto";
import { UpdateOrderNoteDto } from "./dto/update-order-note.dto";
import { OrderDocumentsService } from "./order-documents.service";
import { OrderNotesService } from "./order-notes.service";
import { OrdersService } from "./orders.service";

/// Role matrix per the Orders + Dispatch phase spec:
/// - ADMIN / OPERATIONS_MANAGER / DISPATCHER: full access, including
///   assign/status/cancel ("manage orders... assignments, status updates").
/// - SALES_CRM_MANAGER: "create/read/update orders but cannot assign
///   drivers/vehicles" — read+write on the plain CRUD routes, excluded from
///   assign/status/cancel (those are fulfillment-pipeline actions, not order
///   record edits).
/// - ACCOUNTANT: "read-only orders and dispatch" — read only, no write
///   routes at all.
/// - DRIVER: no access to these routes at all. A driver executes a DISPATCH, not an
///   order (ADR-001), and has their own controller for it: see
///   dispatch/driver/driver-dispatch.controller.ts. The /orders/my* routes that used
///   to live here were removed in Task 8.12 — they found a driver's work by
///   Order.driverId, which since Task 8.6 is a projection, not the truth.
///   phase), which are hard-scoped server-side to the caller's own linked
const READ_ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "SALES_CRM_MANAGER",
  "ACCOUNTANT",
];
const CREATE_UPDATE_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "SALES_CRM_MANAGER"];
const OPERATIONAL_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

const DOCUMENT_UPLOAD_LIMITS = {
  fileSize: 10 * 1024 * 1024,
  files: 1,
  fields: 4,
  parts: 6,
  fieldNameSize: 100,
  fieldSize: 512,
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("orders")
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly orderDocuments: OrderDocumentsService,
    private readonly orderNotes: OrderNotesService,
  ) {}

  @Roles(...READ_ROLES)
  @Get()
  list(@Query() query: ListOrdersQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.ordersService.list(user.organizationId, query);
  }

  @Roles(...CREATE_UPDATE_ROLES)
  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: CurrentUserPayload) {
    return this.ordersService.create(user.organizationId, dto, user);
  }

  @Roles(...CREATE_UPDATE_ROLES)
  @Post("check-duplicate")
  @HttpCode(200)
  checkDuplicate(@Body() dto: CheckDuplicateOrderDto, @CurrentUser() user: CurrentUserPayload) {
    return this.ordersService.checkDuplicate(user.organizationId, dto);
  }

  @Roles(...READ_ROLES)
  @Get(":id")
  getById(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.ordersService.getById(user.organizationId, id);
  }

  @Roles(...CREATE_UPDATE_ROLES)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.ordersService.update(user.organizationId, id, dto, user);
  }

  @Roles(...OPERATIONAL_ROLES)
  @Post(":id/assign")
  @HttpCode(200)
  assign(
    @Param("id") id: string,
    @Body() dto: AssignOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.ordersService.assign(user.organizationId, id, dto, user);
  }

  @Roles(...OPERATIONAL_ROLES)
  @Post(":id/status")
  @HttpCode(200)
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.ordersService.updateStatus(user.organizationId, id, dto, user);
  }

  @Roles(...OPERATIONAL_ROLES)
  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.ordersService.archive(user.organizationId, id, user);
  }

  @Roles(...OPERATIONAL_ROLES)
  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.ordersService.restore(user.organizationId, id, user);
  }

  @Roles(...OPERATIONAL_ROLES)
  @Post(":id/cancel")
  @HttpCode(200)
  cancel(
    @Param("id") id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.ordersService.cancel(user.organizationId, id, dto, user);
  }

  @Roles(...READ_ROLES)
  @Get(":id/documents")
  listDocuments(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.orderDocuments.list(user.organizationId, id);
  }

  @Roles(...CREATE_UPDATE_ROLES)
  @Post(":id/documents")
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: DOCUMENT_UPLOAD_LIMITS }),
  )
  uploadDocument(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadOrderDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.orderDocuments.upload(user.organizationId, id, file, dto.kind, user);
  }

  @Roles(...CREATE_UPDATE_ROLES)
  @Delete(":id/documents/:documentId")
  @HttpCode(204)
  async deleteDocument(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.orderDocuments.delete(user.organizationId, id, documentId, user);
  }

  @Roles(...CREATE_UPDATE_ROLES)
  @Patch(":id/documents/:documentId")
  renameDocument(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() dto: RenameOrderDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.orderDocuments.rename(user.organizationId, id, documentId, dto.fileName, user);
  }

  @Roles(...READ_ROLES)
  @Get(":id/documents/:documentId/file")
  @RawResponse()
  async downloadDocument(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ) {
    const { doc, stream } = await this.orderDocuments.openFile(
      user.organizationId,
      id,
      documentId,
    );
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${doc.fileName.replace(/"/g, "")}"`);
    stream.pipe(res);
  }

  @Roles(...READ_ROLES)
  @Get(":id/notes")
  listNotes(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.orderNotes.list(user.organizationId, id);
  }

  @Roles(...CREATE_UPDATE_ROLES)
  @Post(":id/notes")
  createNote(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateOrderNoteDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.orderNotes.create(user.organizationId, id, dto, user);
  }

  @Roles(...CREATE_UPDATE_ROLES)
  @Patch(":id/notes/:noteId")
  updateNote(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("noteId", ParseUUIDPipe) noteId: string,
    @Body() dto: UpdateOrderNoteDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.orderNotes.update(user.organizationId, id, noteId, dto, user);
  }

  @Roles(...CREATE_UPDATE_ROLES)
  @Delete(":id/notes/:noteId")
  @HttpCode(204)
  async deleteNote(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("noteId", ParseUUIDPipe) noteId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.orderNotes.delete(user.organizationId, id, noteId, user);
  }
}
