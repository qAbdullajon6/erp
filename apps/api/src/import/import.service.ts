import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
// Prisma is imported as a VALUE, not `import type`: Prisma.DbNull below is a
// runtime sentinel, not just a type.
import { Prisma } from "@prisma/client";
import type { ImportSession } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { getEntityDefinition, listEntityDefinitions } from "./registry/entity-registry";
import { FileParserService, type RawRow } from "./parsing/file-parser.service";
import { assertFileSizeWithinLimit, detectFileFormat } from "./parsing/file-format.util";
import { neutralizeFormula, toCsvDocument } from "./parsing/csv-injection.util";
import { MappingService, type ColumnMapping } from "./mapping/mapping.service";
import { ValidationService, type RowError } from "./validation/validation.service";
import { ImportRowWriter, type RowStatusUpdate } from "./execution/import-row-writer";

/// Rows inserted per createMany. Distinct from the execution batch size: this
/// one only bounds the size of a single INSERT statement.
const INSERT_CHUNK = 1_000;
/// Rows shown on the mapping step.
const PREVIEW_ROWS = 5;
/// Errors returned inline by validate. The full set is in the CSV report — a
/// 50k-row file of bad data would otherwise put 50k errors in one JSON body.
const MAX_INLINE_ERRORS = 200;

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parser: FileParserService,
    private readonly mapping: MappingService,
    private readonly validation: ValidationService,
    private readonly rowWriter: ImportRowWriter,
  ) {}

  /// Roles are declared per entity in the registry (fleet data is narrower than
  /// customer data), so authorization cannot be expressed by a single @Roles on
  /// the controller and is enforced here instead.
  private assertCanImport(actor: CurrentUserPayload, entityType: string) {
    const definition = getEntityDefinition(entityType);
    if (!definition) {
      throw new BadRequestException(
        `Unsupported entity type "${entityType}". Supported: ${listEntityDefinitions().map((d) => d.entityType).join(", ")}`,
      );
    }
    if (!definition.allowedRoles.includes(actor.role)) {
      throw new ForbiddenException(
        `Your role (${actor.role}) cannot import ${definition.label.toLowerCase()}`,
      );
    }
    return definition;
  }

  private async findSessionOrThrow(
    organizationId: string,
    sessionId: string,
  ): Promise<ImportSession> {
    const session = await this.prisma.importSession.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session) throw new NotFoundException("Import session not found");
    return session;
  }

  // ── Upload / parse ──────────────────────────────────────────────

  async createSession(
    actor: CurrentUserPayload,
    entityType: string,
    file: { originalname: string; buffer: Buffer; size: number },
  ) {
    const definition = this.assertCanImport(actor, entityType);

    assertFileSizeWithinLimit(file.size);
    const format = detectFileFormat(file.buffer, file.originalname);

    const session = await this.prisma.importSession.create({
      data: {
        organizationId: actor.organizationId,
        uploadedByUserId: actor.userId,
        entityType,
        status: "PENDING",
        fileName: file.originalname.slice(0, 255),
        format,
        fileSizeBytes: file.size,
        headers: [],
      },
    });

    // Rows are buffered to INSERT_CHUNK and flushed — never accumulated for the
    // whole file. This is the memory ceiling for a 50k-row upload.
    const preview: Record<string, unknown>[] = [];
    let pending: Prisma.ImportRowCreateManyInput[] = [];
    let total = 0;

    const flush = async () => {
      if (pending.length === 0) return;
      await this.prisma.importRow.createMany({ data: pending });
      pending = [];
    };

    let headers: string[];
    try {
      const parsed = await this.parser.parse(file.buffer, format, async (row: RawRow, rowNumber) => {
        total = rowNumber;
        if (preview.length < PREVIEW_ROWS) preview.push({ ...row });

        pending.push({
          sessionId: session.id,
          organizationId: actor.organizationId,
          rowNumber,
          rawData: row,
          status: "PENDING",
        });
        if (pending.length >= INSERT_CHUNK) await flush();
      });
      await flush();
      headers = parsed.headers;
    } catch (err) {
      // The session row exists but the file was unusable; delete it rather than
      // leave a PENDING husk in the user's history.
      await this.prisma.importSession.delete({ where: { id: session.id } }).catch(() => undefined);
      throw err;
    }

    if (total === 0) {
      await this.prisma.importSession.delete({ where: { id: session.id } }).catch(() => undefined);
      throw new BadRequestException("File contains a header row but no data rows");
    }

    const defaultMapping = this.mapping.autoMap(headers, definition);

    const updated = await this.prisma.importSession.update({
      where: { id: session.id },
      data: { headers, totalRows: total, columnMapping: defaultMapping },
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "import.upload",
      entityType: "ImportSession",
      entityId: session.id,
      metadata: {
        importEntityType: entityType,
        fileName: updated.fileName,
        format,
        totalRows: total,
        fileSizeBytes: file.size,
      },
    });

    return {
      sessionId: session.id,
      entityType,
      headers,
      totalRows: total,
      // Preview cells are neutralised: they are rendered by the wizard and may
      // be copied into a spreadsheet from there.
      preview: preview.map((row) => this.neutralizeRow(row)),
      columnDefinitions: definition.fields.map((f) => ({
        fieldName: f.fieldName,
        label: f.label,
        required: f.required,
        type: f.type,
        example: f.example ?? "",
        enumValues: f.enumValues ?? null,
      })),
      defaultMapping,
      savedTemplates: await this.mapping.listTemplates(actor.organizationId, entityType),
    };
  }

  private neutralizeRow(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) out[key] = neutralizeFormula(value);
    return out;
  }

  // ── Mapping ─────────────────────────────────────────────────────

  async saveMapping(actor: CurrentUserPayload, sessionId: string, columnMapping: ColumnMapping) {
    const session = await this.findSessionOrThrow(actor.organizationId, sessionId);
    const definition = this.assertCanImport(actor, session.entityType);

    if (!["PENDING", "VALIDATING", "VALIDATED"].includes(session.status)) {
      throw new BadRequestException(
        `Mapping cannot be changed once the import has started (status: ${session.status})`,
      );
    }

    const headers = session.headers as string[];
    this.mapping.assertWellFormed(columnMapping, headers, definition);

    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: { columnMapping },
    });

    return this.mapping.validate(columnMapping, headers, definition);
  }

  // ── Validation / preview ────────────────────────────────────────

  async validateSession(actor: CurrentUserPayload, sessionId: string) {
    const session = await this.findSessionOrThrow(actor.organizationId, sessionId);
    const definition = this.assertCanImport(actor, session.entityType);

    if (session.status === "EXECUTING") {
      throw new BadRequestException("Import is currently running");
    }

    const headers = session.headers as string[];
    const columnMapping = (session.columnMapping ?? {}) as ColumnMapping;
    this.mapping.assertWellFormed(columnMapping, headers, definition);

    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: { status: "VALIDATING" },
    });

    // Re-validating replaces the previous verdict rather than appending to it.
    await this.prisma.importError.deleteMany({ where: { sessionId } });

    const seenNaturalKeys = new Set<string>();
    const inlineErrors: RowError[] = [];
    const validPreview: Record<string, unknown>[] = [];
    const invalidPreview: Record<string, unknown>[] = [];

    let valid = 0;
    let invalid = 0;
    let cursor = 0;

    try {
      for (;;) {
        const batch = await this.prisma.importRow.findMany({
          where: { sessionId, rowNumber: { gt: cursor } },
          orderBy: { rowNumber: "asc" },
          take: INSERT_CHUNK,
          select: { id: true, rowNumber: true, rawData: true },
        });
        if (batch.length === 0) break;
        cursor = batch[batch.length - 1].rowNumber;

        const results = await this.validation.validateBatch(
          actor.organizationId,
          definition,
          columnMapping,
          headers,
          batch.map((r) => ({ rowNumber: r.rowNumber, raw: r.rawData as Record<string, string> })),
          seenNaturalKeys,
        );

        const errorRows: Prisma.ImportErrorCreateManyInput[] = [];
        const statusUpdates: RowStatusUpdate[] = [];

        for (const [i, result] of results.entries()) {
          const row = batch[i];

          for (const error of result.errors) {
            errorRows.push({
              sessionId,
              organizationId: actor.organizationId,
              rowNumber: error.row,
              column: error.column,
              message: error.message,
              value: error.value,
              severity: error.severity,
            });
            if (inlineErrors.length < MAX_INLINE_ERRORS) inlineErrors.push(error);
          }

          if (result.ok) {
            valid += 1;
            if (validPreview.length < PREVIEW_ROWS) {
              validPreview.push(this.neutralizeRow(result.data));
            }
          } else {
            invalid += 1;
            if (invalidPreview.length < PREVIEW_ROWS) {
              invalidPreview.push(this.neutralizeRow(row.rawData as Record<string, unknown>));
            }
          }

          statusUpdates.push({
            id: row.id,
            status: result.ok ? "VALID" : "INVALID",
            // Re-validating a row that previously passed must clear its stale
            // mapping, hence an explicit {} rather than leaving it be.
            mappedData: result.ok ? result.data : {},
          });
        }

        // Two statements per batch, not two per row: this loop used to issue
        // one UPDATE per row and spent the entire validation wall-clock waiting
        // on round trips.
        if (errorRows.length > 0) {
          await this.prisma.importError.createMany({ data: errorRows });
        }
        await this.rowWriter.applyStatuses(statusUpdates);
      }
    } catch (err) {
      await this.prisma.importSession.update({
        where: { id: sessionId },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }

    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: { status: "VALIDATED", validRows: valid, invalidRows: invalid },
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "import.validate",
      entityType: "ImportSession",
      entityId: sessionId,
      metadata: { validRows: valid, invalidRows: invalid, totalRows: valid + invalid },
    });

    const warningCount = await this.prisma.importError.count({
      where: { sessionId, severity: "WARNING" },
    });
    const duplicateCount = await this.prisma.importError.count({
      where: { sessionId, severity: "WARNING", message: { contains: "already exists" } },
    });

    return {
      totalRows: valid + invalid,
      validRows: valid,
      invalidRows: invalid,
      warnings: warningCount,
      duplicates: duplicateCount,
      /// What execution would do, given the current strategy. "New" and
      /// "updates" are what the user actually wants to know before committing.
      newRecords: valid - duplicateCount,
      updates: duplicateCount,
      ignoredColumns: this.mapping.validate(columnMapping, headers, definition).unmappedColumns,
      /// Rough, and labelled as such in the UI. Derived from the engine's
      /// observed throughput rather than a guess pulled from nowhere.
      estimatedSeconds: Math.max(1, Math.ceil(valid / 250)),
      errors: inlineErrors,
      preview: { valid: validPreview, invalid: invalidPreview },
    };
  }

  // ── Reads ───────────────────────────────────────────────────────

  async getSession(organizationId: string, sessionId: string) {
    const session = await this.findSessionOrThrow(organizationId, sessionId);
    return this.toResponse(session);
  }

  async listSessions(
    organizationId: string,
    query: { page?: number; limit?: number; entityType?: string; status?: string },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const where: Prisma.ImportSessionWhereInput = {
      organizationId,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.status ? { status: query.status as never } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.importSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.importSession.count({ where }),
    ]);

    return {
      items: items.map((s) => this.toResponse(s)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /// The wizard reads `validationErrors` off the session. They live in their own
  /// table (a session can have tens of thousands), so they are attached here,
  /// capped — the full set is the CSV report.
  private async attachErrors(sessionId: string) {
    const errors = await this.prisma.importError.findMany({
      where: { sessionId },
      orderBy: [{ rowNumber: "asc" }],
      take: MAX_INLINE_ERRORS,
    });
    return errors.map((e) => ({
      row: e.rowNumber,
      column: e.column,
      message: e.message,
      value: e.value ?? undefined,
      severity: e.severity,
    }));
  }

  async getSessionWithErrors(organizationId: string, sessionId: string) {
    const session = await this.findSessionOrThrow(organizationId, sessionId);
    return { ...this.toResponse(session), validationErrors: await this.attachErrors(sessionId) };
  }

  private toResponse(session: ImportSession) {
    return {
      id: session.id,
      organizationId: session.organizationId,
      uploadedBy: session.uploadedByUserId,
      entityType: session.entityType,
      status: session.status,
      fileName: session.fileName,
      format: session.format,
      duplicateStrategy: session.duplicateStrategy,
      totalRows: session.totalRows,
      validRows: session.validRows,
      invalidRows: session.invalidRows,
      processedRows: session.processedRows,
      successfulRows: session.successfulRows,
      updatedRows: session.updatedRows,
      failedRows: session.failedRows,
      skippedRows: session.skippedRows,
      errorMessage: session.errorMessage,
      cancelRequested: session.cancelRequested,
      headers: session.headers as string[],
      columnMapping: session.columnMapping as ColumnMapping | null,
      startedAt: session.startedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      /// Wall-clock duration of the execution phase. Null until it finishes.
      executionMs:
        session.startedAt && session.completedAt
          ? session.completedAt.getTime() - session.startedAt.getTime()
          : null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      validationErrors: null as unknown,
    };
  }

  // ── Reports ─────────────────────────────────────────────────────

  /// The full error report as a CSV, streamed in pages so a 50k-error report
  /// does not materialise as one array.
  async buildErrorReport(organizationId: string, sessionId: string): Promise<string> {
    await this.findSessionOrThrow(organizationId, sessionId);

    const header = ["Row", "Column", "Severity", "Message", "Value"];
    const rows: unknown[][] = [];

    // Paged rather than one findMany: an error report can legitimately have one
    // row per input row, and holding 50k Prisma objects at once to build a file
    // we then also hold as a string is two copies too many.
    for (let skip = 0; ; skip += INSERT_CHUNK) {
      const page = await this.prisma.importError.findMany({
        where: { sessionId },
        orderBy: [{ rowNumber: "asc" }, { id: "asc" }],
        take: INSERT_CHUNK,
        skip,
      });
      if (page.length === 0) break;
      for (const e of page) {
        rows.push([e.rowNumber, e.column, e.severity, e.message, e.value ?? ""]);
      }
      if (page.length < INSERT_CHUNK) break;
    }

    // toCsvDocument neutralises every cell — the message and value are
    // user-controlled, and this file is opened in Excel by definition.
    return toCsvDocument(header, rows);
  }

  /// A blank file with the right headers and one example row. The fastest way
  /// for a user to produce a file that imports cleanly on the first try.
  buildTemplate(actor: CurrentUserPayload, entityType: string): string {
    const definition = this.assertCanImport(actor, entityType);
    const header = definition.fields.map((f) => (f.required ? `${f.label} *` : f.label));
    const example = definition.fields.map((f) => f.example ?? "");
    return toCsvDocument(header, [example]);
  }
}
