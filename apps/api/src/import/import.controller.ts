import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import type { MembershipRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RawResponse } from "../common/decorators/raw-response.decorator";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { ImportService } from "./import.service";
import { ImportExecutionService } from "./execution/import-execution.service";
import { MappingService } from "./mapping/mapping.service";
import { MAX_IMPORT_FILE_BYTES } from "./parsing/file-format.util";
import { getEntityDefinition, listEntityDefinitions } from "./registry/entity-registry";
import {
  ExecuteImportDto,
  ListImportsQueryDto,
  SaveMappingDto,
  SaveMappingTemplateDto,
} from "./dto/import.dto";

/// Coarse gate. Any role that can import ANY entity can reach the module; which
/// entities each may actually import is enforced per-request against the
/// registry (ImportService.assertCanImport), because that varies by entity —
/// a DISPATCHER may import vehicles but not customers.
const IMPORT_ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "ACCOUNTANT",
  "SALES_CRM_MANAGER",
];

/// Multer limits. These are the first line of defence and the only one that
/// runs before bytes are buffered:
///
///  - fileSize   stops an oversized upload mid-socket rather than after we have
///               held it all in memory.
///  - fields/parts/fieldNameSize bound the multipart parse itself. multer 2.1.1
///    (pinned transitively by @nestjs/platform-express) carries a published DoS
///    via deeply nested field names; these caps make that unreachable regardless
///    of the version resolved. See TD-020.
const UPLOAD_LIMITS = {
  fileSize: MAX_IMPORT_FILE_BYTES,
  files: 1,
  fields: 8,
  parts: 12,
  fieldNameSize: 100,
  fieldSize: 1024,
};

@Controller("import")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...IMPORT_ROLES)
export class ImportController {
  constructor(
    private readonly service: ImportService,
    private readonly execution: ImportExecutionService,
    private readonly mapping: MappingService,
  ) {}

  /// The importable entity types and their fields — lets the wizard build its
  /// dropdown from the registry instead of a hardcoded list that drifts.
  @Get("entities")
  listEntities(@CurrentUser() user: CurrentUserPayload) {
    return {
      items: listEntityDefinitions()
        // Only what this user could actually import; offering an entity that
        // 403s on upload is a worse experience than not offering it.
        .filter((d) => d.allowedRoles.includes(user.role))
        .map((d) => ({
          entityType: d.entityType,
          label: d.label,
          fields: d.fields.map((f) => ({
            fieldName: f.fieldName,
            label: f.label,
            required: f.required,
            type: f.type,
            example: f.example ?? "",
            enumValues: f.enumValues ?? null,
          })),
        })),
    };
  }

  /// Static path, declared before `sessions/:id` so "template" is never parsed
  /// as a session id. The frontend calls /sessions/template/:entityType.
  @Get("sessions/template/:entityType")
  @RawResponse()
  @Header("Content-Type", "text/csv; charset=utf-8")
  downloadTemplate(
    @CurrentUser() user: CurrentUserPayload,
    @Param("entityType") entityType: string,
    @Res({ passthrough: true }) res: Response,
  ): string {
    const definition = getEntityDefinition(entityType);
    if (!definition) throw new BadRequestException(`Unsupported entity type "${entityType}"`);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${entityType.toLowerCase()}-import-template.csv"`,
    );
    return this.service.buildTemplate(user, entityType);
  }

  @Post("sessions")
  @UseInterceptors(FileInterceptor("file", { limits: UPLOAD_LIMITS }))
  createSession(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("entityType") entityType: string,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    // entityType arrives as a multipart field, so it bypasses the global
    // ValidationPipe's DTO handling and is checked here.
    if (!entityType) throw new BadRequestException("entityType is required");

    return this.service.createSession(user, entityType, file);
  }

  @Get("sessions")
  listSessions(@CurrentUser() user: CurrentUserPayload, @Query() query: ListImportsQueryDto) {
    return this.service.listSessions(user.organizationId, query);
  }

  @Get("sessions/:id")
  getSession(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.getSessionWithErrors(user.organizationId, id);
  }

  @Put("sessions/:id/mapping")
  @HttpCode(200)
  saveMapping(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SaveMappingDto,
  ) {
    return this.service.saveMapping(user, id, this.toIndexedMapping(dto.columnMapping));
  }

  @Post("sessions/:id/validate")
  @HttpCode(200)
  validate(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.validateSession(user, id);
  }

  @Post("sessions/:id/execute")
  @HttpCode(200)
  async execute(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ExecuteImportDto,
  ) {
    await this.execution.start(user, id, dto.duplicateStrategy);
    // The session as it stands the instant execution was accepted — status
    // EXECUTING. The wizard polls GET /sessions/:id from here.
    return this.service.getSession(user.organizationId, id);
  }

  @Post("sessions/:id/cancel")
  @HttpCode(200)
  async cancel(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    await this.execution.cancel(user, id);
    return this.service.getSession(user.organizationId, id);
  }

  @Post("sessions/:id/resume")
  @HttpCode(200)
  async resume(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    await this.execution.resume(user, id);
    return this.service.getSession(user.organizationId, id);
  }

  @Post("sessions/:id/retry")
  @HttpCode(200)
  async retry(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    const retried = await this.execution.retryFailed(user, id);
    const session = await this.service.getSession(user.organizationId, id);
    return { ...session, retriedRows: retried };
  }

  @Get("sessions/:id/errors")
  @RawResponse()
  @Header("Content-Type", "text/csv; charset=utf-8")
  async downloadErrors(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="import-errors-${id.slice(0, 8)}.csv"`,
    );
    return this.service.buildErrorReport(user.organizationId, id);
  }

  // ── Mapping templates ───────────────────────────────────────────

  @Get("mappings/:entityType")
  async listTemplates(
    @CurrentUser() user: CurrentUserPayload,
    @Param("entityType") entityType: string,
  ) {
    // Awaited: returning the bare Promise inside an object literal serialized
    // it as `{}`, so the list came back empty with a 200.
    return { items: await this.mapping.listTemplates(user.organizationId, entityType) };
  }

  @Post("sessions/:id/mapping/save-template")
  @HttpCode(201)
  async saveTemplate(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SaveMappingTemplateDto,
  ) {
    const session = await this.service.getSession(user.organizationId, id);
    const saved = await this.mapping.saveTemplate(
      user,
      session.entityType,
      dto.name,
      this.toIndexedMapping(dto.columnMapping),
      session.headers,
    );
    return { id: saved.id, name: saved.name };
  }

  @Delete("mappings/:id")
  @HttpCode(204)
  async deleteTemplate(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.mapping.deleteTemplate(user.organizationId, id);
  }

  /// JSON object keys are strings; the mapping is keyed by column index. Parsed
  /// here so everything below the controller deals in numbers.
  private toIndexedMapping(raw: Record<string, string>): Record<number, string> {
    const out: Record<number, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0) {
        throw new BadRequestException(`Invalid column index "${key}" in mapping`);
      }
      if (value) out[index] = value;
    }
    return out;
  }
}
