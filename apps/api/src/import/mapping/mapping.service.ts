import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import type { EntityDefinition } from "../registry/entity-registry";

/// Column index -> entity field name. Indices, not headers, because the wizard's
/// mapping table is positional and two columns may share a display name once
/// trimmed.
export type ColumnMapping = Record<number, string>;

export interface MappingValidation {
  ok: boolean;
  missingRequired: string[];
  /// Headers the user left unmapped. Not an error — a migration file routinely
  /// carries columns this system has no home for — but the user should be told
  /// what is being dropped rather than discovering it after the import.
  unmappedColumns: string[];
  /// Two source columns pointing at the same field. An error: the engine would
  /// silently pick one, and which one it picked would depend on iteration order.
  duplicateTargets: string[];
}

@Injectable()
export class MappingService {
  constructor(private readonly prisma: PrismaService) {}

  /// Best-effort automatic mapping, by exact match on a normalized header.
  ///
  /// Deliberately exact rather than fuzzy. A fuzzy matcher that maps "Delivery
  /// Cost" onto `price` because it shares a token is worse than no suggestion:
  /// the user sees a filled-in dropdown, trusts it, and imports money into the
  /// wrong column. Everything here is a suggestion the user confirms on the
  /// mapping step — a miss costs one dropdown, a wrong guess costs data.
  autoMap(headers: string[], definition: EntityDefinition): ColumnMapping {
    const mapping: ColumnMapping = {};
    const taken = new Set<string>();

    // Exact fieldName match wins over an alias: if a file was exported from
    // this system, its headers already are our field names.
    for (const [index, header] of headers.entries()) {
      const normalized = this.normalize(header);
      const exact = definition.fields.find(
        (f) => this.normalize(f.fieldName) === normalized || this.normalize(f.label) === normalized,
      );
      if (exact && !taken.has(exact.fieldName)) {
        mapping[index] = exact.fieldName;
        taken.add(exact.fieldName);
      }
    }

    for (const [index, header] of headers.entries()) {
      if (mapping[index]) continue;
      const normalized = this.normalize(header);
      const byAlias = definition.fields.find(
        (f) => !taken.has(f.fieldName) && f.aliases.some((a) => this.normalize(a) === normalized),
      );
      if (byAlias) {
        mapping[index] = byAlias.fieldName;
        taken.add(byAlias.fieldName);
      }
    }

    return mapping;
  }

  /// Lowercase, collapse any run of non-alphanumerics to a single space, trim.
  /// So "Customer_Code", "customer code" and "Customer  Code " all normalize
  /// alike, without the false positives a substring match would bring.
  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  validate(
    mapping: ColumnMapping,
    headers: string[],
    definition: EntityDefinition,
  ): MappingValidation {
    const mappedFields = Object.values(mapping).filter((f) => f && f.length > 0);

    const missingRequired = definition.fields
      .filter((f) => f.required && !mappedFields.includes(f.fieldName))
      .map((f) => f.label);

    const seen = new Set<string>();
    const duplicateTargets: string[] = [];
    for (const field of mappedFields) {
      if (seen.has(field)) {
        const def = definition.fields.find((f) => f.fieldName === field);
        if (def && !duplicateTargets.includes(def.label)) duplicateTargets.push(def.label);
      }
      seen.add(field);
    }

    const unmappedColumns = headers.filter((_h, i) => !mapping[i] || mapping[i] === "");

    return {
      ok: missingRequired.length === 0 && duplicateTargets.length === 0,
      missingRequired,
      unmappedColumns,
      duplicateTargets,
    };
  }

  /// Rejects a mapping that names a field the entity does not have, or a column
  /// index the file does not have. Both mean the client is out of sync with the
  /// server, and letting them through would write to a nonexistent column.
  assertWellFormed(
    mapping: ColumnMapping,
    headers: string[],
    definition: EntityDefinition,
  ): void {
    const known = new Set(definition.fields.map((f) => f.fieldName));

    for (const [indexText, fieldName] of Object.entries(mapping)) {
      if (!fieldName) continue;

      const index = Number(indexText);
      if (!Number.isInteger(index) || index < 0 || index >= headers.length) {
        throw new BadRequestException(
          `Mapping refers to column ${indexText}, but the file has ${headers.length} columns.`,
        );
      }
      if (!known.has(fieldName)) {
        throw new BadRequestException(
          `Mapping refers to unknown field "${fieldName}" for ${definition.entityType}.`,
        );
      }
    }

    const validation = this.validate(mapping, headers, definition);
    if (validation.duplicateTargets.length > 0) {
      throw new BadRequestException(
        `Two columns are mapped to the same field: ${validation.duplicateTargets.join(", ")}.`,
      );
    }
    if (validation.missingRequired.length > 0) {
      throw new BadRequestException(
        `Required field(s) not mapped: ${validation.missingRequired.join(", ")}.`,
      );
    }
  }

  // ── Saved templates ─────────────────────────────────────────────

  /// Templates are keyed by HEADER TEXT, not column index, so a saved template
  /// still applies to next month's export even if its columns moved.
  async saveTemplate(
    actor: CurrentUserPayload,
    entityType: string,
    name: string,
    mapping: ColumnMapping,
    headers: string[],
  ) {
    const byHeader: Record<string, string> = {};
    for (const [indexText, fieldName] of Object.entries(mapping)) {
      const header = headers[Number(indexText)];
      if (header && fieldName) byHeader[header] = fieldName;
    }

    return this.prisma.importMapping.upsert({
      where: {
        organizationId_entityType_name: {
          organizationId: actor.organizationId,
          entityType,
          name,
        },
      },
      create: {
        organizationId: actor.organizationId,
        entityType,
        name,
        mapping: byHeader,
        createdByUserId: actor.userId,
      },
      update: { mapping: byHeader },
    });
  }

  async listTemplates(organizationId: string, entityType: string) {
    const templates = await this.prisma.importMapping.findMany({
      where: { organizationId, entityType },
      orderBy: { updatedAt: "desc" },
    });
    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      entityType: t.entityType,
      mapping: t.mapping as Record<string, string>,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));
  }

  async deleteTemplate(organizationId: string, id: string): Promise<void> {
    const deleted = await this.prisma.importMapping.deleteMany({
      where: { id, organizationId },
    });
    if (deleted.count === 0) throw new BadRequestException("Mapping template not found");
  }

  /// Projects a saved header-keyed template onto this file's column order.
  /// Headers the template does not mention are simply left unmapped.
  applyTemplate(byHeader: Record<string, string>, headers: string[]): ColumnMapping {
    const normalizedTemplate = new Map<string, string>();
    for (const [header, field] of Object.entries(byHeader)) {
      normalizedTemplate.set(this.normalize(header), field);
    }

    const mapping: ColumnMapping = {};
    for (const [index, header] of headers.entries()) {
      const field = normalizedTemplate.get(this.normalize(header));
      if (field) mapping[index] = field;
    }
    return mapping;
  }
}
