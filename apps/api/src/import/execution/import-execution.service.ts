import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Prisma, type ImportDuplicateStrategy } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { OrderWriter } from "../../order-state/order-writer";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { getEntityDefinition, type EntityDefinition, type PostCreateHookName } from "../registry/entity-registry";
import { NaturalKeyService } from "./natural-key.service";
import { ImportRowWriter, type RowStatusUpdate } from "./import-row-writer";

/// Rows per transaction.
///
/// The batch is the unit of atomicity AND of progress. Bigger batches mean
/// fewer round-trips but a longer-held transaction and coarser progress; 500
/// keeps a 50k import to 100 transactions while still moving the progress bar
/// often enough to look alive.
const BATCH_SIZE = 500;

/// A batch that cannot finish in this long is a runaway. Generous, because a
/// batch of 500 orders each writing a history row is legitimately slow on a
/// loaded database.
const BATCH_TIMEOUT_MS = 120_000;

type PostCreateHook = (
  tx: Prisma.TransactionClient,
  organizationId: string,
  entityId: string,
  actor: CurrentUserPayload,
) => Promise<void>;

/// Per-status row tallies. Used both as the authoritative derived counts and as
/// the running in-memory tally during a run.
interface ImportCounters {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
}

/// Reads a row's natural key.
///
/// mappedData is Json, so every field is `unknown` to the compiler. A natural
/// key is always a string or absent — a blind String() would turn a malformed
/// value into the literal "[object Object]" and then happily look it up.
function readNaturalKey(data: Record<string, unknown>, keyField: string): string {
  const value = data[keyField];
  return typeof value === "string" ? value : "";
}

/// Executes a validated session's rows against the real tables.
///
/// Runs out-of-band: `start` returns as soon as the session is marked
/// EXECUTING, and the work continues after the HTTP response. The client polls
/// GET /import/sessions/:id — which the wizard's detail page already does — so
/// a 50k-row import never holds a request open.
///
/// Single-instance, like the webhook dispatcher: two API instances would both
/// pick up a resumed session. The claim is a compare-and-set on status, which
/// makes double-execution impossible rather than merely unlikely. See TD-019.
@Injectable()
export class ImportExecutionService {
  private readonly logger = new Logger(ImportExecutionService.name);

  /// Resolves a registry hook name to its implementation. This map is the only
  /// place entity-specific behaviour lives in the engine; everything else is
  /// driven off the registry.
  private readonly postCreateHooks: Record<PostCreateHookName, PostCreateHook>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly naturalKeys: NaturalKeyService,
    private readonly orderWriter: OrderWriter,
    private readonly rowWriter: ImportRowWriter,
  ) {
    this.postCreateHooks = {
      // ADR-001/AR2: an Order's opening history row commits with the Order or
      // not at all.
      orderStatusHistory: (tx, organizationId, entityId, actor) =>
        this.orderWriter.recordCreated(tx, organizationId, entityId, actor),
    };
  }

  /// Marks the session EXECUTING and kicks off processing. Returns immediately.
  async start(
    actor: CurrentUserPayload,
    sessionId: string,
    strategy: ImportDuplicateStrategy,
  ): Promise<void> {
    // Compare-and-set: only a VALIDATED session may start, and only one caller
    // wins. Without this, a double-clicked Execute button runs the import twice.
    const claimed = await this.prisma.importSession.updateMany({
      where: { id: sessionId, organizationId: actor.organizationId, status: "VALIDATED" },
      data: {
        status: "EXECUTING",
        duplicateStrategy: strategy,
        startedAt: new Date(),
        cancelRequested: false,
        errorMessage: null,
      },
    });

    if (claimed.count === 0) {
      const current = await this.prisma.importSession.findFirst({
        where: { id: sessionId, organizationId: actor.organizationId },
        select: { status: true },
      });
      throw new ConflictException(
        current
          ? `Import cannot be executed from status ${current.status}. Validate it first.`
          : "Import session not found",
      );
    }

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "import.execute",
      entityType: "ImportSession",
      entityId: sessionId,
      metadata: { duplicateStrategy: strategy },
    });

    this.runInBackground(actor, sessionId);
  }

  /// Re-queues a session that stopped partway (cancelled, or failed mid-run).
  /// Rows already IMPORTED/UPDATED are left alone — resume picks up only what
  /// never got processed, which is what makes it safe to press twice.
  async resume(actor: CurrentUserPayload, sessionId: string): Promise<void> {
    const claimed = await this.prisma.importSession.updateMany({
      where: {
        id: sessionId,
        organizationId: actor.organizationId,
        status: { in: ["CANCELLED", "FAILED"] },
      },
      data: { status: "EXECUTING", cancelRequested: false, errorMessage: null, completedAt: null },
    });

    if (claimed.count === 0) {
      throw new ConflictException("Only a cancelled or failed import can be resumed");
    }

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "import.resume",
      entityType: "ImportSession",
      entityId: sessionId,
    });

    this.runInBackground(actor, sessionId);
  }

  /// Re-runs the rows that failed during execution, after the user has fixed
  /// whatever caused them (usually a missing referenced record).
  ///
  /// Resets FAILED rows to VALID and re-runs; rows that succeeded are never
  /// touched, so retry is idempotent and cannot double-create.
  async retryFailed(actor: CurrentUserPayload, sessionId: string): Promise<number> {
    const session = await this.prisma.importSession.findFirst({
      where: { id: sessionId, organizationId: actor.organizationId },
    });
    if (!session) throw new ConflictException("Import session not found");
    if (session.status === "EXECUTING") {
      throw new ConflictException("Import is still running");
    }

    const reset = await this.prisma.importRow.updateMany({
      where: { sessionId, organizationId: actor.organizationId, status: "FAILED" },
      data: { status: "VALID", errorMessage: null },
    });

    if (reset.count === 0) {
      throw new ConflictException("This import has no failed rows to retry");
    }

    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: {
        status: "EXECUTING",
        cancelRequested: false,
        completedAt: null,
        errorMessage: null,
        // These are recomputed from the rows at completion, so zeroing the
        // failure counters here keeps the report honest during the re-run.
        failedRows: 0,
      },
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "import.retry",
      entityType: "ImportSession",
      entityId: sessionId,
      metadata: { retriedRows: reset.count },
    });

    this.runInBackground(actor, sessionId);
    return reset.count;
  }

  /// Cooperative: sets a flag the loop checks between batches. Not an abort —
  /// a batch in flight must still commit or roll back as a unit, and killing it
  /// mid-transaction is what would leave half a batch written.
  async cancel(actor: CurrentUserPayload, sessionId: string): Promise<void> {
    const updated = await this.prisma.importSession.updateMany({
      where: {
        id: sessionId,
        organizationId: actor.organizationId,
        status: { in: ["EXECUTING", "VALIDATING", "PENDING", "VALIDATED"] },
      },
      data: { cancelRequested: true },
    });

    if (updated.count === 0) {
      throw new ConflictException("Only a pending or running import can be cancelled");
    }

    // A session that has not started executing has no loop to notice the flag,
    // so settle it here.
    await this.prisma.importSession.updateMany({
      where: {
        id: sessionId,
        organizationId: actor.organizationId,
        status: { in: ["PENDING", "VALIDATED"] },
      },
      data: { status: "CANCELLED", completedAt: new Date() },
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "import.cancel",
      entityType: "ImportSession",
      entityId: sessionId,
    });
  }

  private runInBackground(actor: CurrentUserPayload, sessionId: string): void {
    setImmediate(() => {
      this.run(actor, sessionId).catch((err: Error) => {
        this.logger.error(`Import ${sessionId} crashed: ${err.message}`, err.stack);
        void this.prisma.importSession
          .update({
            where: { id: sessionId },
            data: { status: "FAILED", errorMessage: err.message, completedAt: new Date() },
          })
          .catch(() => undefined);
      });
    });
  }

  /// Drives the session to a terminal state. Public so tests can await the work
  /// deterministically instead of racing a background task.
  async run(actor: CurrentUserPayload, sessionId: string): Promise<void> {
    const session = await this.prisma.importSession.findUnique({ where: { id: sessionId } });
    if (!session) return;

    const definition = getEntityDefinition(session.entityType);
    if (!definition) {
      await this.fail(sessionId, `Unknown entity type ${session.entityType}`);
      return;
    }

    try {
      // Seeded from the database, so a RESUMED run continues from what actually
      // happened rather than restarting the tally at zero.
      const counters = await this.refreshCounters(sessionId);

      for (;;) {
        const fresh = await this.prisma.importSession.findUnique({
          where: { id: sessionId },
          select: { cancelRequested: true },
        });
        if (fresh?.cancelRequested) {
          await this.settleCancelled(sessionId);
          return;
        }

        // Rows are pulled a batch at a time and never all at once — this is
        // what keeps memory flat regardless of file size.
        const batch = await this.prisma.importRow.findMany({
          where: { sessionId, status: "VALID" },
          orderBy: { rowNumber: "asc" },
          take: BATCH_SIZE,
        });
        if (batch.length === 0) break;

        const outcome = await this.processBatch(
          actor, session.organizationId, definition, session.duplicateStrategy, batch,
        );

        // In-memory tally + one cheap UPDATE, rather than re-aggregating the
        // whole session after every batch. settleCompleted re-derives the
        // authoritative numbers at the end, so any drift here cannot reach the
        // final report.
        counters.imported += outcome.imported;
        counters.updated += outcome.updated;
        counters.skipped += outcome.skipped;
        counters.failed += outcome.failed;
        await this.writeCounters(sessionId, counters);
      }

      await this.settleCompleted(sessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A strategy-ERROR duplicate is a deliberate whole-import abort, not a
      // crash, and reads as a normal failure to the user.
      await this.fail(sessionId, message);
    }
  }

  private async processBatch(
    actor: CurrentUserPayload,
    organizationId: string,
    definition: EntityDefinition,
    strategy: ImportDuplicateStrategy,
    batch: Array<{ id: string; rowNumber: number; mappedData: Prisma.JsonValue }>,
  ): Promise<ImportCounters> {
    const rows = batch.map((row) => ({
      id: row.id,
      rowNumber: row.rowNumber,
      data: (row.mappedData ?? {}) as Record<string, unknown>,
    }));

    // What this batch did, reported back so the caller can move the progress
    // counters without re-aggregating the session.
    const outcome: ImportCounters = { imported: 0, updated: 0, skipped: 0, failed: 0 };

    await this.prisma.$transaction(
      async (tx) => {
        // Re-check duplicates inside the transaction rather than trusting
        // validation's snapshot: minutes may have passed, and someone may have
        // created the record in the meantime.
        const keyField = definition.naturalKey;
        const suppliedKeys = rows
          .map((r) => r.data[keyField])
          .filter((k): k is string => typeof k === "string" && k.length > 0);

        const existing = await this.findExisting(tx, organizationId, definition, suppliedKeys);

        // Allocate codes for rows that supplied none, one block per batch.
        const needingKeys = rows.filter(
          (r) => typeof r.data[keyField] !== "string" || String(r.data[keyField]).length === 0,
        );
        const allocated = await this.naturalKeys.allocate(
          tx, organizationId, definition, needingKeys.length,
        );
        needingKeys.forEach((row, i) => {
          if (allocated[i]) row.data[keyField] = allocated[i];
        });

        // Partition first, then do each group in bulk. Doing this row-by-row
        // cost one INSERT plus one UPDATE per row — 1,000 round trips per
        // 500-row batch, which was the entire execution wall-clock.
        const toCreate: typeof rows = [];
        const toUpdate: Array<{ row: (typeof rows)[number]; entityId: string }> = [];
        const statusUpdates: RowStatusUpdate[] = [];
        const now = new Date();

        for (const row of rows) {
          const key = readNaturalKey(row.data, keyField);
          const match = existing.get(key);

          if (!match) {
            toCreate.push(row);
            continue;
          }
          if (strategy === "ERROR") {
            // Aborts the transaction AND the run — "fail entire import".
            throw new ConflictException(
              `Row ${row.rowNumber}: ${keyField} "${key}" already exists and the duplicate strategy is set to fail the import.`,
            );
          }
          if (strategy === "SKIP") {
            statusUpdates.push({
              id: row.id, status: "SKIPPED", entityId: match, processedAt: now,
            });
            outcome.skipped += 1;
            continue;
          }
          toUpdate.push({ row, entityId: match });
        }

        if (toCreate.length > 0) {
          const created = await this.createEntities(tx, organizationId, definition, toCreate, actor);
          for (const [i, row] of toCreate.entries()) {
            statusUpdates.push({
              id: row.id, status: "IMPORTED", entityId: created[i], processedAt: now,
            });
          }
          outcome.imported += toCreate.length;
        }

        // Updates stay per-row: each writes different values to a different
        // record, which no bulk primitive expresses. They are also the rare
        // case — a migration is mostly new records.
        for (const { row, entityId } of toUpdate) {
          await this.updateEntity(tx, definition, entityId, row.data);
          statusUpdates.push({ id: row.id, status: "UPDATED", entityId, processedAt: now });
          outcome.updated += 1;
        }

        await this.rowWriter.applyStatuses(statusUpdates, tx);
      },
      { timeout: BATCH_TIMEOUT_MS, maxWait: 10_000 },
    ).catch(async (err: unknown) => {
      if (err instanceof ConflictException) throw err;

      // The batch rolled back, so nothing in it was written. Rather than lose
      // 499 good rows to one bad one, re-run the batch row-by-row so each
      // failure is attributed to its own row and the rest still land. This is
      // the "partial success" contract.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Batch failed (${message}); falling back to per-row processing`);

      // Reset rather than accumulate: the transaction above rolled back, so
      // anything it counted never happened. The per-row pass is now the only
      // source of truth for this batch.
      outcome.imported = 0;
      outcome.updated = 0;
      outcome.skipped = 0;
      outcome.failed = 0;

      const fallback = await this.processRowsIndividually(
        actor, organizationId, definition, strategy, rows,
      );
      Object.assign(outcome, fallback);
    });

    return outcome;
  }

  private async processRowsIndividually(
    actor: CurrentUserPayload,
    organizationId: string,
    definition: EntityDefinition,
    strategy: ImportDuplicateStrategy,
    rows: Array<{ id: string; rowNumber: number; data: Record<string, unknown> }>,
  ): Promise<ImportCounters> {
    const keyField = definition.naturalKey;
    const outcome: ImportCounters = { imported: 0, updated: 0, skipped: 0, failed: 0 };

    for (const row of rows) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const key = readNaturalKey(row.data, keyField);
          const existing = key
            ? await this.findExisting(tx, organizationId, definition, [key])
            : new Map<string, string>();
          const match = existing.get(key);

          if (match) {
            if (strategy === "ERROR") {
              throw new ConflictException(`${keyField} "${key}" already exists`);
            }
            if (strategy === "SKIP") {
              await tx.importRow.update({
                where: { id: row.id },
                data: { status: "SKIPPED", entityId: match, processedAt: new Date() },
              });
              outcome.skipped += 1;
              return;
            }
            await this.updateEntity(tx, definition, match, row.data);
            await tx.importRow.update({
              where: { id: row.id },
              data: { status: "UPDATED", entityId: match, processedAt: new Date() },
            });
            outcome.updated += 1;
            return;
          }

          if (!key) {
            const allocated = await this.naturalKeys.allocate(tx, organizationId, definition, 1);
            if (allocated[0]) row.data[keyField] = allocated[0];
          }

          const entityId = await this.createEntity(tx, organizationId, definition, row.data, actor);
          await tx.importRow.update({
            where: { id: row.id },
            data: { status: "IMPORTED", entityId, processedAt: new Date() },
          });
          outcome.imported += 1;
        });
      } catch (err) {
        const message = this.humanizeError(err);
        await this.prisma.importRow.update({
          where: { id: row.id },
          data: { status: "FAILED", errorMessage: message, processedAt: new Date() },
        });
        await this.prisma.importError.create({
          data: {
            sessionId: (await this.prisma.importRow.findUnique({
              where: { id: row.id }, select: { sessionId: true },
            }))!.sessionId,
            organizationId,
            rowNumber: row.rowNumber,
            column: "",
            message,
            severity: "ERROR",
          },
        });
        outcome.failed += 1;
      }
    }

    return outcome;
  }

  /// Prisma's raw errors name constraints and columns, which is noise to the
  /// person who uploaded a spreadsheet. Translate the ones we cause.
  private humanizeError(err: unknown): string {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "a unique field";
        return `A record with the same ${target} already exists`;
      }
      if (err.code === "P2003") return "References a record that does not exist";
      if (err.code === "P2025") return "The record to update no longer exists";
    }
    return err instanceof Error ? err.message : String(err);
  }

  /// Case-sensitive, matching the `@@unique([organizationId, <key>])` constraint
  /// that actually decides what a duplicate is — see the note on
  /// ValidationService.detectDuplicates. Matching insensitively here would let
  /// UPDATE overwrite a record the user did not name, and made this an
  /// ILIKE-ANY seq scan per batch.
  private async findExisting(
    tx: Prisma.TransactionClient,
    organizationId: string,
    definition: EntityDefinition,
    keys: string[],
  ): Promise<Map<string, string>> {
    if (keys.length === 0) return new Map();

    const delegate = tx[definition.prismaModel] as unknown as {
      findMany(args: unknown): Promise<Record<string, unknown>[]>;
    };
    const rows = await delegate.findMany({
      where: { organizationId, [definition.naturalKey]: { in: keys } },
      select: { id: true, [definition.naturalKey]: true },
    });

    const out = new Map<string, string>();
    for (const row of rows) {
      const key = row[definition.naturalKey];
      if (typeof key === "string" && typeof row.id === "string") {
        out.set(key, row.id);
      }
    }
    return out;
  }

  /// Inserts many entities in one statement, returning their ids in input order.
  ///
  /// The ids are generated HERE rather than by the database, which is what makes
  /// `createMany` usable at all: Prisma's createMany does not return the rows it
  /// wrote, so without knowing the ids up front there would be no way to record
  /// which import row produced which record — and we would be back to one
  /// INSERT per row purely to learn its id.
  ///
  /// Client-side UUIDs are not a workaround: `@default(uuid())` in the schema is
  /// already generated by Prisma in this process, not by Postgres. Supplying one
  /// explicitly does exactly what the default would have.
  private async createEntities(
    tx: Prisma.TransactionClient,
    organizationId: string,
    definition: EntityDefinition,
    rows: Array<{ data: Record<string, unknown> }>,
    actor: CurrentUserPayload,
  ): Promise<string[]> {
    const ids = rows.map(() => randomUUID());

    const delegate = tx[definition.prismaModel] as unknown as {
      createMany(args: unknown): Promise<{ count: number }>;
    };
    await delegate.createMany({
      data: rows.map((row, i) => ({
        ...this.toPrismaData(definition, row.data),
        id: ids[i],
        organizationId,
      })),
    });

    const hookName = definition.postCreateHook;
    if (hookName) {
      // Sequential rather than Promise.all: these run inside one transaction,
      // and a Prisma transaction client is not safe to use concurrently.
      for (const id of ids) {
        await this.postCreateHooks[hookName](tx, organizationId, id, actor);
      }
    }

    return ids;
  }

  /// Single-entity create, for the per-row fallback path where a failure must be
  /// attributable to exactly one row.
  private async createEntity(
    tx: Prisma.TransactionClient,
    organizationId: string,
    definition: EntityDefinition,
    data: Record<string, unknown>,
    actor: CurrentUserPayload,
  ): Promise<string> {
    const [id] = await this.createEntities(tx, organizationId, definition, [{ data }], actor);
    return id;
  }

  private async updateEntity(
    tx: Prisma.TransactionClient,
    definition: EntityDefinition,
    entityId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const delegate = tx[definition.prismaModel] as unknown as {
      update(args: unknown): Promise<unknown>;
    };
    const payload = this.toPrismaData(definition, data);
    // The natural key is what identified this record; writing it back is a
    // no-op at best and a case-change at worst.
    delete payload[definition.naturalKey];
    // An update must never move a record between tenants.
    delete payload.organizationId;

    await delegate.update({ where: { id: entityId }, data: payload });
  }

  /// Whitelists to fields the registry declares, so a mappedData that somehow
  /// carried an extra key cannot write a column nobody mapped. Decimal fields
  /// are converted explicitly — Prisma accepts a JS number for a Decimal column
  /// but rounds through float, which silently loses money at scale.
  private toPrismaData(
    definition: EntityDefinition,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of definition.fields) {
      const value = data[field.fieldName];
      if (value === undefined || value === null) continue;

      if (field.type === "decimal") {
        // Only a number or a numeric string can be here — validation coerced it.
        // Anything else means mappedData was tampered with, and Decimal would
        // otherwise be handed "[object Object]".
        if (typeof value !== "number" && typeof value !== "string") continue;
        out[field.fieldName] = new Prisma.Decimal(value);
      } else if (field.type === "date") {
        if (value instanceof Date) out[field.fieldName] = value;
        else if (typeof value === "string" || typeof value === "number") {
          out[field.fieldName] = new Date(value);
        }
      } else {
        out[field.fieldName] = value;
      }
    }
    return out;
  }

  /// Recomputes the counters from the rows themselves — the authoritative
  /// number, and what the completion report is built from.
  ///
  /// Deliberately derived rather than incremented: an increment that runs twice
  /// (a resumed batch, a retried row) drifts from reality, and the migration
  /// report is the thing a customer decides to trust their data by.
  ///
  /// Called at the START and END of a run, not per batch. Per batch it was a
  /// groupBy over every row in the session — 100 batches x 50k rows on a large
  /// import, which is quadratic and was most of the execution wall-clock.
  /// In-flight progress uses countersFrom/bumped tallies instead; this is what
  /// settles them.
  private async refreshCounters(sessionId: string): Promise<ImportCounters> {
    const grouped = await this.prisma.importRow.groupBy({
      by: ["status"],
      where: { sessionId },
      _count: { _all: true },
    });
    const count = (status: string) =>
      grouped.find((g) => g.status === status)?._count._all ?? 0;

    const counters: ImportCounters = {
      imported: count("IMPORTED"),
      updated: count("UPDATED"),
      skipped: count("SKIPPED"),
      failed: count("FAILED"),
    };

    await this.writeCounters(sessionId, counters);
    return counters;
  }

  private async writeCounters(sessionId: string, c: ImportCounters): Promise<void> {
    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: {
        successfulRows: c.imported,
        updatedRows: c.updated,
        skippedRows: c.skipped,
        failedRows: c.failed,
        processedRows: c.imported + c.updated + c.skipped + c.failed,
      },
    });
  }

  private async settleCompleted(sessionId: string): Promise<void> {
    await this.refreshCounters(sessionId);
    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  private async settleCancelled(sessionId: string): Promise<void> {
    await this.refreshCounters(sessionId);
    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
  }

  private async fail(sessionId: string, message: string): Promise<void> {
    await this.refreshCounters(sessionId).catch(() => undefined);
    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
  }
}
