import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { EntityDefinition } from "../registry/entity-registry";

/// Allocates natural keys (CUS-0001, DRV-0002, ...) for rows whose file did
/// not supply one.
///
/// A migration file exported from another system almost never carries our
/// codes, and making the user invent 5,000 of them by hand would defeat the
/// wizard. The existing per-entity services already auto-generate these on
/// single creates; this is the bulk equivalent.
///
/// Allocation is per (organization, entity) and happens INSIDE the caller's
/// transaction, reserving a contiguous block per batch rather than one code per
/// row — 500 rows is one lookup, not 500.
@Injectable()
export class NaturalKeyService {
  /// Reserves `count` sequential codes and returns them.
  ///
  /// The high-water mark is read from the table itself rather than a counter
  /// column, so it stays correct no matter who else created records (the UI,
  /// the API, an earlier import). The read is inside the caller's transaction;
  /// under concurrent imports into the same organization two batches could read
  /// the same max, so the unique constraint on the natural key is the real
  /// arbiter — a collision surfaces as a row-level failure, not silent
  /// overwriting. See TD-021 in docs/TECHNICAL_DEBT.md.
  async allocate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    definition: EntityDefinition,
    count: number,
  ): Promise<string[]> {
    if (count === 0) return [];

    const prefix = definition.naturalKeyPrefix;
    if (!prefix) return [];

    const highest = await this.findHighestSequence(tx, organizationId, definition, prefix);

    const codes: string[] = [];
    for (let i = 1; i <= count; i++) {
      codes.push(`${prefix}-${String(highest + i).padStart(4, "0")}`);
    }
    return codes;
  }

  /// Scans existing codes for the largest numeric suffix.
  ///
  /// Ordering is done in memory over codes with our prefix rather than by a
  /// database ORDER BY, because a lexical sort puts "CUS-10" before "CUS-9" —
  /// which would hand out a duplicate the moment a customer passes 9 records.
  private async findHighestSequence(
    tx: Prisma.TransactionClient,
    organizationId: string,
    definition: EntityDefinition,
    prefix: string,
  ): Promise<number> {
    const delegate = tx[definition.prismaModel] as unknown as {
      findMany(args: unknown): Promise<Record<string, unknown>[]>;
    };

    const rows = await delegate.findMany({
      where: {
        organizationId,
        [definition.naturalKey]: { startsWith: `${prefix}-` },
      },
      select: { [definition.naturalKey]: true },
    });

    let highest = 0;
    const pattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`);
    for (const row of rows) {
      const code = row[definition.naturalKey];
      if (typeof code !== "string") continue;
      const match = pattern.exec(code);
      if (!match) continue;
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n > highest) highest = n;
    }
    return highest;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
