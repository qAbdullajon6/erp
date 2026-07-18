import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { repairDriftedDispatches } from "./repair-drifted-dispatches";

/// TD-005 data repair.
///
///   npm run repair:dispatches              # dry run, writes nothing
///   npm run repair:dispatches -- --apply   # for real
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prisma = new PrismaClient();
  try {
    const apply = args.includes("--apply");
    const orgAt = args.indexOf("--organization");
    const organizationId = orgAt !== -1 ? args[orgAt + 1] : undefined;
    const runId = randomUUID().slice(0, 8);

    const report = await repairDriftedDispatches(prisma, { dryRun: !apply, organizationId, runId });

    console.log(
      `\nTD-005 — drifted dispatches — ${report.dryRun ? "DRY RUN (nothing written)" : `APPLIED (run ${runId})`}\n`,
    );
    if (report.repaired.length === 0) {
      console.log("  Nothing to repair: every dispatch agrees with its order.\n");
      return;
    }
    for (const r of report.repaired) {
      const flag = r.wasPhantomReservation ? "  [was holding a driver hostage]" : "";
      console.log(`  ${r.dispatchNumber}  ${r.from} -> ${r.to}   (order ${r.orderNumber} is ${r.orderStatus})${flag}`);
    }
    console.log("");
    if (report.dryRun) console.log("Re-run with --apply to write these.\n");
  } finally {
    await prisma.$disconnect();
  }
}

void main();
