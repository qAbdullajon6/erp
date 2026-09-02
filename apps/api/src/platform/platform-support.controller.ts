import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";
import { createReadStream, existsSync, mkdirSync } from "fs";
import { extname, join } from "path";
import { randomUUID } from "crypto";
import { diskStorage } from "multer";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PlatformSupportService } from "./platform-support.service";
import { RawResponse } from "../common/decorators/raw-response.decorator";
import {
  CreateSupportTicketDto,
  ListSupportTicketsQueryDto,
  UpdateSupportTicketDto,
} from "./dto/support-ticket.dto";

const UPLOADS_DIR = join(process.cwd(), "uploads", "support");
mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", pdf: "application/pdf", txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

class AddStaffMessageDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

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

  /// Staff reply — creates a SupportTicketMessage with isStaff=true.
  @Post(":id/messages")
  addMessage(
    @Param("id") id: string,
    @Body() dto: AddStaffMessageDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.support.addStaffMessage(id, dto.body, user);
  }

  /// Staff asks the tenant to confirm the issue is solved. The ticket stays
  /// IN_PROGRESS until the tenant answers the confirmation prompt.
  @Post(":id/request-confirmation")
  requestConfirmation(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.support.requestResolutionConfirmation(id, user);
  }

  /// Upload a file attachment (staff side). Shares the same uploads directory
  /// as the tenant upload endpoint — attachments are org-neutral blobs.
  @Post(":id/attachments")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadAttachment(
    @Param("id") _ticketId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new NotFoundException("No file provided");
    return {
      url: `/api/support/attachments/${file.filename}`,
      name: file.originalname,
      mime: file.mimetype,
      size: file.size,
    };
  }

  /// Serve an uploaded attachment. Accessible by both platform staff and
  /// tenant users via the tenant support controller's GET endpoint; this
  /// route is an alias so staff can also preview files from within the
  /// platform console.
  @Get("attachments/:filename")
  @RawResponse()
  serveAttachment(@Param("filename") filename: string, @Res() res: Response) {
    if (filename.includes("/") || filename.includes("..")) throw new NotFoundException("File not found");
    const filePath = join(UPLOADS_DIR, filename);
    if (!existsSync(filePath)) throw new NotFoundException("File not found");
    const ext = extname(filename).slice(1).toLowerCase();
    res.setHeader("Content-Type", MIME_MAP[ext] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=86400");
    createReadStream(filePath).pipe(res);
  }
}
