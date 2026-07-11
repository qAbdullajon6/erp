import { DispatchStatus, PrismaClient } from "@prisma/client";

/// TD-005 — reconcile dispatches that drifted away from the order they execute.
///
/// This is a DATA correction, not a feature. It repairs rows created before Task
/// 8.5, when an order could be driven to a terminal state through the Order API
/// while its dispatch was left untouched — the split-brain ADR-001 exists to kill.
/// Since 8.5 an order-level status change MOVES the dispatch, so this cannot
/// happen again; there is no code defect left to fix, only history to straighten.
///
/// The damage is not cosmetic. A dispatch left in a RESERVING state (R1) holds its
/// driver and vehicle forever, and since Task 8.6 made Dispatch the sole execution
/// source, that phantom reservation is the ONLY thing availability consults. The
/// driver is permanently, inexplicably busy.
///
/// ## Why it writes the status directly instead of using DispatchesService
///
/// DispatchesService enforces R13 — a dispatch steps forward one legal state at a
/// time. ASSIGNED -> DELIVERED is not a legal step, and rightly so: no lorry
/// teleports. But that rule describes how a dispatch may MOVE THROUGH REALITY, and
/// this dispatch is not moving — reality already happened, days ago, and the row is
/// simply wrong about it. Walking it through EN_ROUTE_TO_PICKUP and AT_PICKUP would
/// fabricate a journey with today's timestamps that nobody made.
///
/// So the row is corrected, and the history records exactly that: one row saying
/// what the dispatch actually is, noted as a repair. Nothing is invented.
///
/// It does NOT touch the Order. ProjectionPolicy owns Order state (AR5), and the
/// order is already correct — it is the dispatch that lied.

export interface RepairOptions {
  /// Report and write nothing. The default.
  dryRun?: boolean;
  organizationId?: string;
  /// Stamped into the history note so a run can be identified afterwards.
  runId: string;
}

export interface RepairEntry {
  dispatchNumber: string;
  orderNumber: string;
  orderStatus: string;
  from: DispatchStatus;
  to: DispatchStatus;
  /// True when the drifted dispatch was in a RESERVING state, i.e. it was actively
  /// holding a driver and a vehicle hostage.
  wasPhantomReservation: boolean;
}

export interface RepairReport {
  runId: string;
  dryRun: boolean;
  repaired: RepairEntry[];
}

/// A dispatch in one of these states reserves its driver and vehicle (R1).
const RESERVING: DispatchStatus[] = [
  "ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "AT_PICKUP",
  "IN_TRANSIT",
];

/// Where a drifted dispatch should end up, given what its order actually did.
///
///   order DELIVERED, dispatch was executing  -> DELIVERED. The trip happened; the
///                                               dispatch just never recorded it.
///   order DELIVERED, dispatch still a DRAFT  -> CANCELLED. The draft was never
///                                               executed — the order was delivered
///                                               without it — so it is a dead plan,
///                                               not a completed trip. Calling it
///                                               DELIVERED would claim a journey
///                                               this dispatch never made.
///   order CANCELLED, dispatch anything       -> CANCELLED.
function targetFor(orderStatus: string, dispatchStatus: DispatchStatus): DispatchStatus | null {
  if (orderStatus === "CANCELLED") return "CANCELLED";
  if (orderStatus !== "DELIVERED") return null;
  return dispatchStatus === "DRAFT" ? "CANCELLED" : "DELIVERED";
}

/// Finds every dispatch that disagrees with a finished order, and corrects it.
///
/// Idempotent: a dispatch already in a terminal state that matches its order is not
/// selected, so a second run does nothing.
export async function repairDriftedDispatches(
  prisma: PrismaClient,
  options: RepairOptions,
): Promise<RepairReport> {
  const dryRun = options.dryRun ?? true;

  const drifted = await prisma.dispatch.findMany({
    where: {
      ...(options.organizationId ? { organizationId: options.organizationId } : {}),
      // Not yet finished...
      status: { notIn: ["DELIVERED", "CANCELLED"] },
      // ...but the order it executes is.
      order: { status: { in: ["DELIVERED", "CANCELLED"] } },
    },
    include: { order: { select: { orderNumber: true, status: true, deliveredAt: true } } },
    orderBy: { dispatchNumber: "asc" },
  });

  const report: RepairReport = { runId: options.runId, dryRun, repaired: [] };

  for (const dispatch of drifted) {
    const target = targetFor(dispatch.order.status, dispatch.status);
    if (!target) continue;

    report.repaired.push({
      dispatchNumber: dispatch.dispatchNumber,
      orderNumber: dispatch.order.orderNumber,
      orderStatus: dispatch.order.status,
      from: dispatch.status,
      to: target,
      wasPhantomReservation: RESERVING.includes(dispatch.status),
    });

    if (dryRun) continue;

    await prisma.$transaction(async (tx) => {
      await tx.dispatch.update({
        where: { id: dispatch.id },
        data: {
          status: target,
          // R7 — the delivery time is the one the ORDER already recorded. We do not
          // invent a new one, and we do not overwrite a time the dispatch somehow
          // already has.
          ...(target === "DELIVERED" && !dispatch.deliveryDateActual
            ? { deliveryDateActual: dispatch.order.deliveredAt }
            : {}),
        },
      });

      // One history row, honestly labelled. No fabricated intermediate steps.
      await tx.dispatchStatusHistory.create({
        data: {
          organizationId: dispatch.organizationId,
          dispatchId: dispatch.id,
          status: target,
          note: `TD-005 repair (run ${options.runId}): reconciled with order ${dispatch.order.orderNumber}, which is ${dispatch.order.status}`,
        },
      });
    });
  }

  return report;
}
