import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { backfillDispatches, rollbackBackfill, verifyBackfill } from "./backfill";

/// ADR-001 Phase 5 backfill, from the command line.
///
///   npm run backfill:dispatches                    # dry run, writes nothing
///   npm run backfill:dispatches -- --apply         # for real
///   npm run backfill:dispatches -- --verify        # reconciliation only
///   npm run backfill:dispatches -- --rollback <id> # undo one run
///
/// Dry run is the DEFAULT. Applying to live business data requires saying so.
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prisma = new PrismaClient();

  try {
    const rollbackAt = args.indexOf("--rollback");
    if (rollbackAt !== -1) {
      const runId = args[rollbackAt + 1];
      if (!runId) throw new Error("--rollback needs the run id to undo");
      const { removed } = await rollbackBackfill(prisma, runId);
      console.log(`Rolled back run ${runId}: removed ${removed} backfilled dispatch(es).`);
      return;
    }

    const orgAt = args.indexOf("--organization");
    const organizationId = orgAt !== -1 ? args[orgAt + 1] : undefined;

    if (args.includes("--verify")) {
      report(await verifyBackfill(prisma, organizationId));
      return;
    }

    const apply = args.includes("--apply");
    const runId = randomUUID().slice(0, 8);
    const result = await backfillDispatches(prisma, { dryRun: !apply, organizationId, runId });

    console.log(
      [
        "",
        `ADR-001 Phase 5 backfill — ${result.dryRun ? "DRY RUN (nothing written)" : `APPLIED (run ${runId})`}`,
        "",
        `  dispatches to create      ${result.created.length}`,
        `  already dispatched        ${result.alreadyDispatched}   (idempotent: a re-run does nothing)`,
        `  orders with no assignment ${result.notAssigned}`,
        `  skipped, unrepresentable  ${result.skippedUnrepresentable.length}`,
        `  skipped, incomplete       ${result.skippedIncomplete.length}`,
        "",
      ].join("\n"),
    );

    for (const entry of result.created) {
      console.log(`  + ${entry.orderNumber}  ${entry.orderStatus} -> dispatch ${entry.inferredDispatchStatus}`);
    }
    for (const entry of result.skippedUnrepresentable) {
      console.log(`  ! ${entry.orderNumber}  is ${entry.orderStatus} but holds a driver/vehicle — no dispatch state represents this; left alone`);
    }
    for (const entry of result.skippedIncomplete) {
      console.log(`  ! ${entry.orderNumber}  has ${entry.hasDriver ? "a driver but no vehicle" : "a vehicle but no driver"} — cannot reconstruct; left alone`);
    }

    if (!result.dryRun) {
      console.log("");
      console.log(`Reconciliation (roll back with: --rollback ${runId})`);
      report(await verifyBackfill(prisma, organizationId));
    } else if (result.created.length > 0) {
      console.log("\nRe-run with --apply to write these.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

function report(result: Awaited<ReturnType<typeof verifyBackfill>>): void {
  if (result.orphanedOrders.length === 0 && result.disagreeingOrders.length === 0) {
    console.log("  OK — every assigned order has a dispatch that projects back to its current status.");
    return;
  }
  for (const orderNumber of result.orphanedOrders) {
    console.log(`  ORPHAN     ${orderNumber} is assigned but has no dispatch`);
  }
  for (const row of result.disagreeingOrders) {
    console.log(`  DISAGREES  ${row.orderNumber} is ${row.orderStatus} but its dispatch is ${row.dispatchStatus}`);
  }
  process.exitCode = 1;
}

void main();
