import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { createReadStream, existsSync, mkdirSync } from "fs";
import { extname, join } from "path";
import { randomUUID } from "crypto";
import { diskStorage } from "multer";
import { RawResponse } from "../common/decorators/raw-response.decorator";
import { SkipTimeout } from "../common/decorators/skip-timeout.decorator";
import { SupportRealtimeService } from "./realtime/support-realtime.service";
import { openSupportSseStream } from "./realtime/open-support-sse-stream";
import type { MembershipRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { SupportService } from "./support.service";
import {
  CreateTicketDto,
  CreateMessageDto,
  ListTicketsQueryDto,
} from "./dto/support.dto";

/// All non-DRIVER staff roles can access support.
const SUPPORT_ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "ACCOUNTANT",
  "SALES_CRM_MANAGER",
];

const UPLOADS_DIR = join(process.cwd(), "uploads", "support");
// Ensure directory exists at startup.
mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("support")
export class SupportController {
  constructor(
    private readonly service: SupportService,
    private readonly realtime: SupportRealtimeService,
  ) {}

  /// Authenticated SSE stream that delivers realtime support events to the
  /// tenant. Organization membership is determined from the JWT — never from
  /// a client-supplied parameter.
  @Get("events")
  @Roles(...SUPPORT_ROLES)
  @SkipTimeout()
  @RawResponse()
  liveEvents(@CurrentUser() user: CurrentUserPayload, @Res() res: Response): void {
    openSupportSseStream(this.realtime, res, {
      organizationId: user.organizationId,
      userId: user.userId,
    });
  }

  /// Count of tickets that have unread staff messages for this user.
  @Roles(...SUPPORT_ROLES)
  @Get("tickets/unread-count")
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getUnreadCount(user.userId, user.organizationId);
  }

  /// List all tickets for the requesting user's organization.
  @Roles(...SUPPORT_ROLES)
  @Get("tickets")
  list(
    @Query() query: ListTicketsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.listTickets(user.organizationId, query);
  }

  /// Create a new support ticket.
  @Roles(...SUPPORT_ROLES)
  @Post("tickets")
  create(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createTicket(user.organizationId, dto, user);
  }

  /// Get a single ticket (with messages) by ID.
  @Roles(...SUPPORT_ROLES)
  @Get("tickets/:id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.getTicket(user.organizationId, id);
  }

  /// Add a reply message to an open ticket.
  @Roles(...SUPPORT_ROLES)
  @Post("tickets/:id/messages")
  addMessage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.addMessage(user.organizationId, id, dto, user);
  }

  /// Upload a file attachment for a ticket. Returns the URL to embed in a
  /// message body as [attach:{...}].
  @Roles(...SUPPORT_ROLES)
  @Post("tickets/:id/attachments")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  )
  async uploadAttachment(
    @Param("id", ParseUUIDPipe) ticketId: string,
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // Verify the ticket exists and belongs to this org before accepting the upload.
    await this.service.getTicket(user.organizationId, ticketId);
    if (!file) throw new NotFoundException("No file provided");
    return {
      url: `/api/support/attachments/${file.filename}`,
      name: file.originalname,
      mime: file.mimetype,
      size: file.size,
    };
  }

  /// Serve a previously uploaded attachment. Auth-protected — only
  /// authenticated support users can download files.
  @Roles(...SUPPORT_ROLES)
  @Get("attachments/:filename")
  @RawResponse()
  serveAttachment(
    @Param("filename") filename: string,
    @Res() res: Response,
  ) {
    // Sanitize: reject traversal attempts.
    if (filename.includes("/") || filename.includes("..")) {
      throw new NotFoundException("File not found");
    }
    const filePath = join(UPLOADS_DIR, filename);
    if (!existsSync(filePath)) throw new NotFoundException("File not found");

    const ext = extname(filename).slice(1).toLowerCase();
    res.setHeader("Content-Type", MIME_MAP[ext] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=86400");
    createReadStream(filePath).pipe(res);
  }

  /// Close a ticket (tenant-initiated).
  @Roles(...SUPPORT_ROLES)
  @Post("tickets/:id/close")
  close(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.closeTicket(user.organizationId, id, user);
  }

  /// Tenant confirms the staff answer solved the issue → chat CLOSED.
  @Roles(...SUPPORT_ROLES)
  @Post("tickets/:id/confirm-resolution")
  confirmResolution(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.confirmResolution(user.organizationId, id);
  }

  /// Tenant declines ("still have a question") → prompt withdrawn, chat stays
  /// IN_PROGRESS.
  @Roles(...SUPPORT_ROLES)
  @Post("tickets/:id/decline-resolution")
  declineResolution(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.declineResolution(user.organizationId, id);
  }

  /// Returns a safe, org-scoped text summary of the ticket for AI context
  /// injection. The frontend must use this rather than sending raw ticket
  /// data to the AI, so context is always server-verified.
  @Roles(...SUPPORT_ROLES)
  @Get("tickets/:id/ai-context")
  aiContext(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.getAiContext(user.organizationId, id).then((context) => ({ context }));
  }

  /// Mark all messages in this ticket as read for the current user.
  @Roles(...SUPPORT_ROLES)
  @Post("tickets/:id/read")
  markRead(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.markTicketRead(user.organizationId, id, user.userId);
  }
}
