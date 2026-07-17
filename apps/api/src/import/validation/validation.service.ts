import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { EntityDefinition } from "../registry/entity-registry";
import { cellToText, coerceValue, type FieldDefinition } from "../registry/field-types";
import { looksLikeFormula } from "../parsing/csv-injection.util";
import type { ColumnMapping } from "../mapping/mapping.service";

export interface RowError {
  row: number;
  column: string;
  message: string;
  value?: string;
  severity: "ERROR" | "WARNING";
}

export interface ValidatedRow {
  rowNumber: number;
  ok: boolean;
  data: Record<string, unknown>;
  errors: RowError[];
}

/// A row plus its raw cells, as read back from import_rows.
export interface RowInput {
  rowNumber: number;
  raw: Record<string, string>;
}

/// Truncation for stored error values. Long enough to identify the offending
/// cell, short enough that a 50k-row file of bad data cannot bloat the table.
const MAX_STORED_VALUE = 200;

@Injectable()
export class ValidationService {
  constructor(private readonly prisma: PrismaService) {}

  /// Validates a batch of rows together.
  ///
  /// Batch-at-a-time rather than row-at-a-time is a correctness requirement,
  /// not just a speed one: duplicate detection and reference resolution both
  /// need to see the whole batch (and the database) at once. Doing it per row
  /// would mean one SELECT per reference per row — 50k rows x 2 references is
  /// 100k queries, which is the difference between an import that finishes and
  /// one that times out.
  async validateBatch(
    organizationId: string,
    definition: EntityDefinition,
    mapping: ColumnMapping,
    headers: string[],
    rows: RowInput[],
    /// Natural keys already seen earlier in this same file. Carried across
    /// batches by the caller so a duplicate spanning a batch boundary is still
    /// caught.
    seenNaturalKeys: Set<string>,
  ): Promise<ValidatedRow[]> {
    const fieldByName = new Map(definition.fields.map((f) => [f.fieldName, f]));

    // Pass 1 — pure, per-row coercion. No I/O.
    const results: ValidatedRow[] = rows.map((row) =>
      this.coerceRow(row, definition, mapping, headers, fieldByName),
    );

    // Pass 2 — resolve references in bulk, one query per referenced entity.
    await this.resolveReferences(organizationId, definition, results);

    // Pass 3 — duplicates, against the database and within the file.
    await this.detectDuplicates(organizationId, definition, results, seenNaturalKeys);

    for (const result of results) {
      result.ok = !result.errors.some((e) => e.severity === "ERROR");
    }

    return results;
  }

  private coerceRow(
    row: RowInput,
    definition: EntityDefinition,
    mapping: ColumnMapping,
    headers: string[],
    fieldByName: Map<string, FieldDefinition>,
  ): ValidatedRow {
    const errors: RowError[] = [];
    const data: Record<string, unknown> = {};

    // Drive off the MAPPING, not the file's columns: an unmapped column is
    // intentionally dropped, and a mapped-but-absent column still has to run
    // its required check.
    const mappedFields = new Set(Object.values(mapping).filter(Boolean));

    for (const fieldName of mappedFields) {
      const field = fieldByName.get(fieldName);
      if (!field) continue;

      const index = Object.entries(mapping).find(([, f]) => f === fieldName)?.[0];
      const header = index !== undefined ? headers[Number(index)] : undefined;
      const rawValue = header !== undefined ? row.raw[header] : undefined;

      if (looksLikeFormula(rawValue)) {
        // Not rejected: the cell's cached result is what the parser already
        // took for XLSX, and for CSV a leading "=" is usually a stray export
        // artefact. But the user is told, because importing "=SUM(A1:A9)" as
        // the literal text of a company name is not what they meant.
        errors.push({
          row: row.rowNumber,
          column: header ?? fieldName,
          message: `Value looks like a spreadsheet formula and was imported as plain text`,
          value: this.truncate(rawValue),
          severity: "WARNING",
        });
      }

      const coerced = coerceValue(rawValue, field);
      if (!coerced.ok) {
        errors.push({
          row: row.rowNumber,
          column: header ?? field.label,
          message: coerced.error ?? `${field.label} is invalid`,
          value: this.truncate(rawValue),
          severity: "ERROR",
        });
        continue;
      }
      if (coerced.value !== null && coerced.value !== undefined) {
        data[fieldName] = coerced.value;
      }
    }

    // Fields with a default that were never mapped at all still need it.
    for (const field of definition.fields) {
      if (data[field.fieldName] === undefined && field.defaultValue !== undefined) {
        data[field.fieldName] = field.defaultValue;
      }
    }

    return { rowNumber: row.rowNumber, ok: errors.length === 0, data, errors };
  }

  /// One query per referenced entity per batch, regardless of row count.
  private async resolveReferences(
    organizationId: string,
    definition: EntityDefinition,
    results: ValidatedRow[],
  ): Promise<void> {
    const referenceFields = definition.fields.filter((f) => f.type === "reference");
    if (referenceFields.length === 0) return;

    for (const field of referenceFields) {
      const rawValues = new Set<string>();
      for (const result of results) {
        const value = result.data[field.fieldName];
        if (typeof value === "string" && value.length > 0) rawValues.add(value);
      }
      if (rawValues.size === 0) continue;

      const resolved = await this.lookupReferences(
        organizationId,
        field.referenceEntity!,
        [...rawValues],
      );

      for (const result of results) {
        const value = result.data[field.fieldName];
        if (typeof value !== "string" || value.length === 0) continue;

        const id = resolved.get(value.toLowerCase());
        if (!id) {
          result.errors.push({
            row: result.rowNumber,
            column: field.label,
            message: `Unknown ${field.referenceEntity!.toLowerCase()}: "${value}" does not match any existing record`,
            value: this.truncate(value),
            severity: "ERROR",
          });
          delete result.data[field.fieldName];
          continue;
        }
        result.data[field.fieldName] = id;
      }
    }
  }

  /// Resolves the several things a human might type for a reference, mapped
  /// back by every accepted spelling. A user migrating expenses will write
  /// "DRV-0001" in one row and "Ivan Petrov" in the next; both are the driver.
  private async lookupReferences(
    organizationId: string,
    entity: "Customer" | "Driver" | "Vehicle" | "Order",
    values: string[],
  ): Promise<Map<string, string>> {
    const lower = values.map((v) => v.toLowerCase());
    const out = new Map<string, string>();
    const add = (key: string | null | undefined, id: string) => {
      if (key) out.set(key.toLowerCase(), id);
    };

    switch (entity) {
      case "Customer": {
        const rows = await this.prisma.customer.findMany({
          where: {
            organizationId,
            archivedAt: null,
            OR: [
              { customerCode: { in: values, mode: "insensitive" } },
              { companyName: { in: values, mode: "insensitive" } },
            ],
          },
          select: { id: true, customerCode: true, companyName: true },
        });
        for (const r of rows) {
          add(r.customerCode, r.id);
          add(r.companyName, r.id);
        }
        break;
      }
      case "Driver": {
        const rows = await this.prisma.driver.findMany({
          where: {
            organizationId,
            archivedAt: null,
            OR: [
              { employeeCode: { in: values, mode: "insensitive" } },
              { email: { in: values, mode: "insensitive" } },
            ],
          },
          select: { id: true, employeeCode: true, email: true, firstName: true, lastName: true },
        });
        for (const r of rows) {
          add(r.employeeCode, r.id);
          add(r.email, r.id);
          // Full name is matched in memory: a database OR across concatenated
          // columns cannot use an index anyway, so this costs nothing extra.
          const fullName = `${r.firstName} ${r.lastName}`;
          if (lower.includes(fullName.toLowerCase())) add(fullName, r.id);
        }
        break;
      }
      case "Vehicle": {
        const rows = await this.prisma.vehicle.findMany({
          where: {
            organizationId,
            archivedAt: null,
            OR: [
              { vehicleCode: { in: values, mode: "insensitive" } },
              { plateNumber: { in: values, mode: "insensitive" } },
            ],
          },
          select: { id: true, vehicleCode: true, plateNumber: true },
        });
        for (const r of rows) {
          add(r.vehicleCode, r.id);
          add(r.plateNumber, r.id);
        }
        break;
      }
      case "Order": {
        const rows = await this.prisma.order.findMany({
          where: { organizationId, orderNumber: { in: values, mode: "insensitive" } },
          select: { id: true, orderNumber: true },
        });
        for (const r of rows) add(r.orderNumber, r.id);
        break;
      }
    }

    return out;
  }

  /// Flags rows whose natural key already exists, or repeats within the file.
  ///
  /// These are WARNINGs, not ERRORs: a duplicate is not invalid data, it is a
  /// decision. What happens to it is the user's duplicate-strategy choice at
  /// execution time, so failing validation here would take that choice away.
  /// The exception is a repeat *within the same file*, which is an error in the
  /// file itself — no strategy makes "two rows claiming the same code" coherent.
  ///
  /// Matching is CASE-SENSITIVE, deliberately, because that is what actually
  /// governs: every natural key carries a Postgres `@@unique([organizationId,
  /// <key>])`, which is case-sensitive, and the domain services check it with an
  /// exact lookup. Matching case-insensitively here would report "CUS-1" and
  /// "cus-1" as the same record when the database will happily store both — so
  /// SKIP would drop a row the user wanted, and UPDATE would overwrite the wrong
  /// one. It is also what lets the query use the unique index instead of
  /// seq-scanning the table once per batch.
  private async detectDuplicates(
    organizationId: string,
    definition: EntityDefinition,
    results: ValidatedRow[],
    seenNaturalKeys: Set<string>,
  ): Promise<void> {
    const keyField = definition.naturalKey;

    const keys = results
      .map((r) => r.data[keyField])
      .filter((k): k is string => typeof k === "string" && k.length > 0);

    const existing = keys.length > 0
      ? await this.findExistingNaturalKeys(organizationId, definition, keys)
      : new Set<string>();

    for (const result of results) {
      const key = result.data[keyField];
      if (typeof key !== "string" || key.length === 0) continue;

      if (seenNaturalKeys.has(key)) {
        result.errors.push({
          row: result.rowNumber,
          column: keyField,
          message: `Duplicate ${keyField} "${key}" — this value appears more than once in the file`,
          value: this.truncate(key),
          severity: "ERROR",
        });
        continue;
      }
      seenNaturalKeys.add(key);

      if (existing.has(key)) {
        result.errors.push({
          row: result.rowNumber,
          column: keyField,
          message: `${keyField} "${key}" already exists — it will be handled according to your duplicate strategy`,
          value: this.truncate(key),
          severity: "WARNING",
        });
      }
    }
  }

  private async findExistingNaturalKeys(
    organizationId: string,
    definition: EntityDefinition,
    keys: string[],
  ): Promise<Set<string>> {
    return new Set(await this.queryNaturalKeys(organizationId, definition, keys));
  }

  /// The `as never` casts are the price of one generic path over five Prisma
  /// delegates whose where-types are structurally identical but nominally
  /// distinct. The alternative is a five-way switch that says the same thing
  /// five times — and would need a sixth arm every time the registry grows,
  /// which is exactly the coupling the registry exists to remove.
  private async queryNaturalKeys(
    organizationId: string,
    definition: EntityDefinition,
    keys: string[],
  ): Promise<string[]> {
    const delegate = this.prisma[definition.prismaModel] as unknown as {
      findMany(args: unknown): Promise<Record<string, unknown>[]>;
    };
    const rows = await delegate.findMany({
      where: {
        organizationId,
        // No `mode: "insensitive"` — see detectDuplicates. It made this an
        // ILIKE-ANY over the whole table (one comparison per row per key), which
        // took validation from ~2,400 rows/sec to ~69.
        [definition.naturalKey]: { in: keys },
      },
      select: { [definition.naturalKey]: true },
    });
    return rows
      .map((r) => r[definition.naturalKey])
      .filter((v): v is string => typeof v === "string");
  }

  private truncate(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    // cellToText, not String(): a non-scalar would stringify to the literal
    // "[object Object]" and be shown to the user as if it were their cell.
    const text = cellToText(value);
    if (text.length === 0) return undefined;
    return text.length > MAX_STORED_VALUE ? `${text.slice(0, MAX_STORED_VALUE)}…` : text;
  }
}
