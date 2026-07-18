import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface RowStatusUpdate {
  id: string;
  status: "VALID" | "INVALID" | "IMPORTED" | "UPDATED" | "SKIPPED" | "FAILED";
  mappedData?: Record<string, unknown> | null;
  entityId?: string | null;
  errorMessage?: string | null;
  processedAt?: Date | null;
}

/// Bulk writer for import_rows.
///
/// Exists because `prisma.importRow.update()` per row is one network round trip
/// per row, and at ~4ms each that alone was the dominant cost of both
/// validation and execution — a 50k-row import spent minutes doing nothing but
/// waiting on 50,000 sequential UPDATEs.
///
/// Prisma has no bulk-update-with-different-values primitive (`updateMany`
/// applies ONE value set to many rows), so this drops to a single parameterised
/// `UPDATE ... FROM (VALUES ...)`. One statement per batch instead of N.
@Injectable()
export class ImportRowWriter {
  constructor(private readonly prisma: PrismaService) {}

  /// Applies per-row updates in a single statement.
  ///
  /// `tx` lets this participate in the execution batch's transaction; omit it
  /// and it runs standalone (which is what validation wants).
  async applyStatuses(
    updates: RowStatusUpdate[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (updates.length === 0) return;

    const client = tx ?? this.prisma;

    // Every value is a bound parameter — nothing is interpolated into the SQL
    // text, so a hostile cell can reach here without being able to escape it.
    //
    // The casts must match the real column types, which are TEXT for id and
    // entityId: Prisma maps `String @id @default(uuid())` to text, not to
    // Postgres's native uuid. Casting these to ::uuid makes the join fail with
    // "operator does not exist: text = uuid".
    const values = Prisma.join(
      updates.map(
        (u) => Prisma.sql`(
          ${u.id}::text,
          ${u.status}::"ImportRowStatus",
          ${u.mappedData === undefined || u.mappedData === null
            ? null
            : JSON.stringify(u.mappedData)}::jsonb,
          ${u.entityId ?? null}::text,
          ${u.errorMessage ?? null}::text,
          ${u.processedAt ?? null}::timestamp
        )`,
      ),
    );

    // COALESCE on mappedData: a status-only update (e.g. marking a row FAILED)
    // passes null for it, and must not wipe the mapping validation computed.
    await client.$executeRaw`
      UPDATE "import_rows" AS r
      SET
        "status" = v.status,
        "mappedData" = COALESCE(v."mappedData", r."mappedData"),
        "entityId" = COALESCE(v."entityId", r."entityId"),
        "errorMessage" = v."errorMessage",
        "processedAt" = COALESCE(v."processedAt", r."processedAt")
      FROM (VALUES ${values})
        AS v(id, status, "mappedData", "entityId", "errorMessage", "processedAt")
      WHERE r."id" = v.id
    `;
  }
}
