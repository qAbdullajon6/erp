import { ConflictException } from "@nestjs/common";
import { DispatchStatus, OrderStatus, Prisma, PrismaClient } from "@prisma/client";
import { translateDispatchWriteError } from "../dispatch/dispatch-constraints";

/// ADR-001 Phase 5 — the backfill that makes Dispatch the execution record for
/// orders that predate it.
///
/// Implements R3 (Order is a projection of Dispatch) for HISTORICAL data: an order
/// that carries a driver and a vehicle but has no dispatch is an order whose
/// execution was never recorded. Until it has one, ProjectionPolicy has nothing to
/// derive it from, AssignmentQueries can only see it through the legacy Order arm,
/// and Task 8.6 cannot drop that arm.
///
/// ## What it does NOT do
///
/// It does not synthesise DispatchAssignment history. That history genuinely does
/// not exist — nobody recorded when a driver was put on a job or taken off it —
/// and inventing plausible-looking rows would be fabricating an audit trail. R9's
/// table stays empty for legacy orders, and that is the honest answer. (Scope
/// decision, Amendment B.)
///
/// It does not touch the order. The backfill only creates the missing dispatch;
/// the order is already in the state the dispatch will project, by construction —
/// which is exactly what `verify` checks.

/// The dispatch state that reproduces an order's current status. This is the
/// INVERSE of the projection table, and it is deliberately duplicated nowhere:
/// it is derived from ADR-001 Amendment B's mapping, read backwards.
///
/// PICKED_UP -> AT_PICKUP (not IN_TRANSIT): the order was picked up but not yet
/// under way, which is precisely what AT_PICKUP means.
const INFERRED_STATE: Partial<Record<OrderStatus, DispatchStatus>> = {
  ASSIGNED: "ASSIGNED",
  PICKED_UP: "AT_PICKUP",
  IN_TRANSIT: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
};

export interface BackfillOptions {
  /// Compute and report, write nothing. The default, deliberately: this is a
  /// migration over live business data and it should be looked at before it runs.
  dryRun?: boolean;
  /// Restrict to one tenant. Omit to sweep every organization.
  organizationId?: string;
  /// Stamps the dispatches this run creates, so `rollback` can find exactly them
  /// and nothing else.
  runId: string;
}

export interface BackfillPlanEntry {
  orderId: string;
  orderNumber: string;
  organizationId: string;
  orderStatus: OrderStatus;
  inferredDispatchStatus: DispatchStatus;
  driverId: string;
  vehicleId: string;
}

export interface BackfillReport {
  runId: string;
  dryRun: boolean;
  /// Orders that already have a dispatch. Re-running the backfill sees every order
  /// it previously fixed sitting in here, which is what makes it idempotent.
  alreadyDispatched: number;
  /// Orders with no driver/vehicle: nothing to execute, nothing to record.
  notAssigned: number;
  /// Orders in a status no dispatch can represent (DRAFT, PENDING, CANCELLED) but
  /// which nonetheless carry a driver or a vehicle. Left alone and reported —
  /// they are data errors, and guessing at them is how you corrupt a migration.
  skippedUnrepresentable: BackfillPlanEntry[];
  /// Orders carrying exactly one of driverId/vehicleId. A dispatch requires both,
  /// so these cannot be reconstructed. Reported, never guessed.
  skippedIncomplete: { orderId: string; orderNumber: string; hasDriver: boolean; hasVehicle: boolean }[];
  /// Legacy orders the database REFUSED, because reconstructing their dispatch
  /// would double-book a driver or a vehicle (R5).
  ///
  /// This is not a bug in the backfill — it is the backfill DISCOVERING that the
  /// legacy data is already corrupt. Before Task 8.2 nothing stopped two orders
  /// from holding the same driver over the same window, and some do. The dispatch
  /// exclusion constraint is what finally says so. These are reported for a human
  /// to resolve; the backfill will not pick a winner on their behalf.
  conflicted: { orderId: string; orderNumber: string; reason: string }[];
  /// What was (or, in a dry run, would be) created.
  created: BackfillPlanEntry[];
}

/// Creates the dispatch every assigned-but-undispatched order should have had.
///
/// Idempotent: an order is picked up only if it has NO dispatch at all, so a second
/// run finds nothing to do. Safe to run repeatedly, and safe to run after a partial
/// failure — each order is committed in its own transaction, so a crash halfway
/// leaves a consistent prefix rather than a torn one.
export async function backfillDispatches(
  prisma: PrismaClient,
  options: BackfillOptions,
): Promise<BackfillReport> {
  const dryRun = options.dryRun ?? true;
  const scope: Prisma.OrderWhereInput = options.organizationId
    ? { organizationId: options.organizationId }
    : {};

  const report: BackfillReport = {
    runId: options.runId,
    dryRun,
    alreadyDispatched: 0,
    notAssigned: 0,
    skippedUnrepresentable: [],
    skippedIncomplete: [],
    conflicted: [],
    created: [],
  };

  // Any order holding a driver OR a vehicle is a candidate; the ones holding
  // neither have nothing to execute.
  const candidates = await prisma.order.findMany({
    where: {
      ...scope,
      OR: [{ driverId: { not: null } }, { vehicleId: { not: null } }],
    },
    include: { dispatches: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });

  const unassigned = await prisma.order.count({
    where: { ...scope, driverId: null, vehicleId: null },
  });
  report.notAssigned = unassigned;

  for (const order of candidates) {
    if (order.dispatches.length > 0) {
      report.alreadyDispatched += 1;
      continue;
    }

    if (!order.driverId || !order.vehicleId) {
      report.skippedIncomplete.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        hasDriver: Boolean(order.driverId),
        hasVehicle: Boolean(order.vehicleId),
      });
      continue;
    }

    const inferred = INFERRED_STATE[order.status];
    const entry: BackfillPlanEntry = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      organizationId: order.organizationId,
      orderStatus: order.status,
      inferredDispatchStatus: inferred ?? "DRAFT",
      driverId: order.driverId,
      vehicleId: order.vehicleId,
    };

    if (!inferred) {
      // DRAFT / PENDING / CANCELLED with a driver attached. No dispatch state
      // projects onto these (a dispatch that existed would MOVE the order), so
      // creating one would change the order's status — the one thing a backfill
      // must never do.
      report.skippedUnrepresentable.push(entry);
      continue;
    }

    if (dryRun) {
      report.created.push(entry);
      continue;
    }

    try {
      await createBackfilledDispatch(prisma, order, inferred, options.runId);
      report.created.push(entry);
    } catch (error) {
      // The database refused this dispatch. Translate it, so a genuine
      // double-booking in the legacy data is reported as one — and anything that
      // is NOT a constraint violation still explodes, because that would be a real
      // failure and swallowing it would corrupt the migration silently.
      const conflict = asConflict(error);
      if (!conflict) throw error;
      report.conflicted.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason: conflict.message,
      });
    }
  }

  return report;
}

/// The domain error a constraint violation means, or null if this was not a
/// constraint violation at all (in which case the caller must not swallow it).
function asConflict(error: unknown): ConflictException | null {
  try {
    translateDispatchWriteError(error);
  } catch (translated) {
    if (translated instanceof ConflictException) return translated;
  }
  return null;
}

interface BackfillableOrder {
  id: string;
  organizationId: string;
  orderNumber: string;
  driverId: string | null;
  vehicleId: string | null;
  pickupDate: Date;
  deliveryDate: Date;
  status: OrderStatus;
  deliveredAt: Date | null;
}

async function createBackfilledDispatch(
  prisma: PrismaClient,
  order: BackfillableOrder,
  inferred: DispatchStatus,
  runId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction: another run (or a live request) may have
    // created the dispatch since we listed the candidates. This is what keeps two
    // concurrent backfills from double-creating.
    const existing = await tx.dispatch.count({ where: { orderId: order.id } });
    if (existing > 0) return;

    const dispatch = await tx.dispatch.create({
      data: {
        organizationId: order.organizationId,
        dispatchNumber: await nextDispatchNumber(tx, order.organizationId),
        orderId: order.id,
        driverId: order.driverId!,
        vehicleId: order.vehicleId!,
        status: inferred,
        // The dispatch executes the trip the order was sold as.
        pickupDateScheduled: order.pickupDate,
        deliveryDateScheduled: order.deliveryDate,
        // R7 in reverse: the order already knows when it was delivered, and the
        // projection will read this back off the dispatch. They must agree.
        deliveryDateActual: order.status === "DELIVERED" ? order.deliveredAt : null,
        notes: `Backfilled from order ${order.orderNumber} (ADR-001 Phase 5, run ${runId})`,
      },
    });

    // One history row recording what we know: that the dispatch arrived in this
    // state. We do NOT invent the steps it "must" have passed through — those
    // timestamps never existed.
    await tx.dispatchStatusHistory.create({
      data: {
        organizationId: order.organizationId,
        dispatchId: dispatch.id,
        status: inferred,
        note: `Backfilled (run ${runId})`,
      },
    });
  });
}

/// Undoes exactly one backfill run, and nothing else.
///
/// Only dispatches stamped with this runId are removed, so a rollback cannot touch
/// a dispatch a real dispatcher created afterwards. History rows cascade with the
/// dispatch. The orders were never modified, so there is nothing to restore.
export async function rollbackBackfill(
  prisma: PrismaClient,
  runId: string,
): Promise<{ removed: number }> {
  const created = await prisma.dispatch.findMany({
    where: { notes: { contains: `run ${runId}` } },
    select: { id: true },
  });

  const result = await prisma.dispatch.deleteMany({
    where: { id: { in: created.map((d) => d.id) } },
  });

  return { removed: result.count };
}

/// The reconciliation check: after a real run, does every assigned order now have
/// a dispatch that projects back to the status the order is already in?
///
/// This is the property that matters. If it fails, the backfill has changed the
/// meaning of live business data, and the run must be rolled back.
export async function verifyBackfill(
  prisma: PrismaClient,
  organizationId?: string,
): Promise<{ orphanedOrders: string[]; disagreeingOrders: { orderNumber: string; orderStatus: OrderStatus; dispatchStatus: DispatchStatus }[] }> {
  const scope = organizationId ? { organizationId } : {};

  const assigned = await prisma.order.findMany({
    where: { ...scope, status: { in: ["ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"] } },
    include: { dispatches: true },
  });

  const orphanedOrders: string[] = [];
  const disagreeingOrders: { orderNumber: string; orderStatus: OrderStatus; dispatchStatus: DispatchStatus }[] = [];

  for (const order of assigned) {
    if (order.dispatches.length === 0) {
      // Only a genuine orphan if it actually had resources to execute with.
      if (order.driverId && order.vehicleId) orphanedOrders.push(order.orderNumber);
      continue;
    }
    const expected = INFERRED_STATE[order.status];
    const live = order.dispatches.find((d) => d.status !== "CANCELLED");
    if (expected && live && live.status !== expected) {
      disagreeingOrders.push({
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        dispatchStatus: live.status,
      });
    }
  }

  return { orphanedOrders, disagreeingOrders };
}

/// Deliberately not reusing generateUniqueDispatchNumber: that one takes a
/// PrismaService and lives in the dispatch module, and importing a Nest service
/// into a migration script drags the whole DI graph in. Same algorithm, same
/// prefix, and the unique index is the guarantee either way.
async function nextDispatchNumber(tx: Prisma.TransactionClient, organizationId: string): Promise<string> {
  const existing = await tx.dispatch.findMany({
    where: { organizationId, dispatchNumber: { startsWith: "DSP-" } },
    select: { dispatchNumber: true },
  });
  const highest = existing.reduce((max, d) => {
    const n = Number.parseInt(d.dispatchNumber.slice(4), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `DSP-${String(highest + 1).padStart(6, "0")}`;
}
