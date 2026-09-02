import { createHash } from "node:crypto";
import { Prisma, type Customer, type Dispatch, type Driver, type Order, type Vehicle } from "@prisma/client";
import type { Reservation } from "../assignment/assignment.queries";
import type {
  ConflictRecommendation,
  ConflictSeverity,
  ConflictType,
  DispatchConflict,
} from "./dispatch-conflict.types";
import { conflictCategory } from "./dispatch-conflict.types";

export type DispatchConflictContext = Dispatch & {
  order: Order & { customer: Customer };
  driver: Driver;
  vehicle: Vehicle;
};

export interface ConflictDetectionInput {
  dispatch: DispatchConflictContext;
  reservations: Reservation[];
  now?: Date;
  customerBalanceDue?: Prisma.Decimal;
}

function formatConflictDate(value: Date): string {
  /// Date-only fields (license/inspection) are stored as UTC midnight; format
  /// in UTC so "2004-05-26T00:00:00.000Z" always reads as May 26, 2004.
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function stableId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

function buildConflict(
  keyParts: string[],
  type: ConflictType,
  severity: ConflictSeverity,
  message: string,
  description: string,
  recommendation: string,
  recommendations: ConflictRecommendation[],
  details?: Record<string, unknown>,
  autoResolvable = false,
): DispatchConflict {
  const id = stableId(keyParts);
  return {
    id,
    type,
    category: conflictCategory(type),
    severity,
    message,
    description,
    recommendation,
    recommendations,
    autoResolvable,
    ignored: false,
    resolved: false,
    detectedAt: new Date().toISOString(),
    details,
  };
}

const TERMINAL_DISPATCH = new Set(["DELIVERED", "CANCELLED"]);
const ACTIVE_STATUSES = new Set([
  "ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "AT_PICKUP",
  "IN_TRANSIT",
  "AT_STOP",
]);

export function detectDispatchConflicts(input: ConflictDetectionInput): DispatchConflict[] {
  const { dispatch, reservations, now = new Date() } = input;
  const conflicts: DispatchConflict[] = [];
  const { driver, vehicle, order } = dispatch;

  // --- Business ---
  if (dispatch.status === "CANCELLED") {
    conflicts.push(
      buildConflict(
        [dispatch.id, "business.dispatch_cancelled"],
        "business.dispatch_cancelled",
        "medium",
        "Dispatch cancelled",
        "This dispatch was cancelled and should not be scheduled or assigned.",
        "Reopen by creating a new dispatch or restore the order workflow.",
        [{ action: "recheck", label: "Recheck conflicts" }],
      ),
    );
  }
  if (dispatch.status === "DELIVERED") {
    conflicts.push(
      buildConflict(
        [dispatch.id, "business.dispatch_completed"],
        "business.dispatch_completed",
        "medium",
        "Dispatch completed",
        "This dispatch is already delivered — further operational changes are blocked.",
        "No action required unless correcting data.",
        [{ action: "recheck", label: "Recheck conflicts" }],
      ),
    );
  }
  if (order.archivedAt || order.status === "CANCELLED" || order.status === "DELIVERED") {
    conflicts.push(
      buildConflict(
        [dispatch.id, "business.order_closed", order.id],
        "business.order_closed",
        "medium",
        "Order closed",
        `Order ${order.orderNumber} is ${order.archivedAt ? "archived" : order.status.toLowerCase()}.`,
        "Review the order before continuing dispatch operations.",
        [{ action: "recheck", label: "Recheck conflicts" }],
        { orderId: order.id, orderStatus: order.status },
      ),
    );
  }
  if (order.customer.status === "INACTIVE" || order.customer.status === "ARCHIVED") {
    conflicts.push(
      buildConflict(
        [dispatch.id, "business.customer_blocked", order.customerId],
        "business.customer_blocked",
        "medium",
        "Customer blocked",
        `${order.customer.companyName} is ${order.customer.status.toLowerCase()}.`,
        "Contact sales or finance before dispatching.",
        [
          { action: "contact_finance", label: "Contact finance" },
          { action: "ignore", label: "Ignore" },
        ],
        { customerId: order.customerId, customerStatus: order.customer.status },
      ),
    );
  }

  const creditLimit = order.customer.creditLimit;
  const balanceDue = input.customerBalanceDue ?? new Prisma.Decimal(0);
  // null creditLimit = no configured ceiling → skip credit hold check.
  if (creditLimit != null && creditLimit.gt(0) && balanceDue.gt(creditLimit)) {
    conflicts.push(
      buildConflict(
        [dispatch.id, "business.credit_hold", order.customerId],
        "business.credit_hold",
        "medium",
        "Credit hold",
        `Customer balance ${balanceDue.toString()} exceeds credit limit ${creditLimit.toString()}.`,
        "Contact finance before releasing this shipment.",
        [
          { action: "contact_finance", label: "Contact finance" },
          { action: "ignore", label: "Ignore" },
        ],
        {
          customerId: order.customerId,
          balanceDue: balanceDue.toString(),
          creditLimit: creditLimit.toString(),
        },
      ),
    );
  } else if (order.customer.status === "AT_RISK") {
    conflicts.push(
      buildConflict(
        [dispatch.id, "business.credit_hold", order.customerId, "at_risk"],
        "business.credit_hold",
        "low",
        "Customer at risk",
        `${order.customer.companyName} is flagged AT_RISK.`,
        "Confirm payment terms with finance.",
        [{ action: "contact_finance", label: "Contact finance" }],
        { customerId: order.customerId, customerStatus: "AT_RISK" },
        true,
      ),
    );
  }

  if (TERMINAL_DISPATCH.has(dispatch.status)) {
    return conflicts;
  }

  // --- Driver ---
  if (driver.archivedAt || driver.status === "INACTIVE") {
    conflicts.push(
      buildConflict(
        [dispatch.id, "driver.inactive", driver.id],
        "driver.inactive",
        "critical",
        "Driver inactive",
        `${driver.firstName} ${driver.lastName} is not active.`,
        "Choose another driver or reactivate this driver.",
        [
          { action: "swap_driver", label: "Swap driver" },
          { action: "ignore", label: "Ignore" },
        ],
        { driverId: driver.id, driverStatus: driver.status },
      ),
    );
  } else if (driver.status === "ON_LEAVE") {
    conflicts.push(
      buildConflict(
        [dispatch.id, "driver.on_leave", driver.id],
        "driver.on_leave",
        "critical",
        "Driver on leave",
        `${driver.firstName} ${driver.lastName} is marked ON_LEAVE.`,
        "Assign an available driver for this window.",
        [
          { action: "swap_driver", label: "Swap driver" },
          { action: "reschedule", label: "Reschedule", payload: { shiftMinutes: 30 } },
        ],
        { driverId: driver.id },
      ),
    );
  }

  if (driver.licenseExpiry && driver.licenseExpiry < now) {
    conflicts.push(
      buildConflict(
        [dispatch.id, "driver.license_expired", driver.id],
        "driver.license_expired",
        "high",
        "Driver license expired",
        `License for ${driver.firstName} ${driver.lastName} expired ${formatConflictDate(driver.licenseExpiry)}.`,
        "Swap driver or renew license before departure.",
        [{ action: "swap_driver", label: "Swap driver" }],
        { driverId: driver.id, licenseExpiry: driver.licenseExpiry.toISOString() },
      ),
    );
  }

  const driverReservation = reservations.find((r) => r.driverId === driver.id);
  if (driverReservation) {
    conflicts.push(
      buildConflict(
        [dispatch.id, "driver.assigned", driver.id, driverReservation.reference],
        "driver.assigned",
        "critical",
        "Driver already assigned",
        `${driver.firstName} ${driver.lastName} is committed to ${driverReservation.reference}.`,
        "Choose another driver or reschedule this dispatch.",
        [
          {
            action: "swap_driver",
            label: "Swap driver",
            payload: { conflictingReference: driverReservation.reference },
          },
          {
            action: "reschedule",
            label: "Reschedule +30 min",
            payload: { shiftMinutes: 30 },
          },
        ],
        {
          driverId: driver.id,
          conflictingReference: driverReservation.reference,
          conflictingOrderId: driverReservation.trip.id,
        },
      ),
    );
  }

  // --- Vehicle ---
  if (vehicle.archivedAt || vehicle.status === "INACTIVE") {
    conflicts.push(
      buildConflict(
        [dispatch.id, "vehicle.inactive", vehicle.id],
        "vehicle.inactive",
        "critical",
        "Vehicle inactive",
        `${vehicle.plateNumber} is not available for dispatch.`,
        "Choose another vehicle or return this unit to service.",
        [{ action: "swap_vehicle", label: "Swap vehicle" }],
        { vehicleId: vehicle.id, vehicleStatus: vehicle.status },
      ),
    );
  } else if (vehicle.status === "MAINTENANCE") {
    conflicts.push(
      buildConflict(
        [dispatch.id, "vehicle.maintenance", vehicle.id],
        "vehicle.maintenance",
        "critical",
        "Vehicle in maintenance",
        `${vehicle.plateNumber} is scheduled for maintenance.`,
        "Swap vehicle before dispatch.",
        [{ action: "swap_vehicle", label: "Swap vehicle" }],
        { vehicleId: vehicle.id },
      ),
    );
  } else if (vehicle.status === "IN_USE") {
    conflicts.push(
      buildConflict(
        [dispatch.id, "vehicle.unavailable", vehicle.id],
        "vehicle.unavailable",
        "high",
        "Vehicle unavailable",
        `${vehicle.plateNumber} is currently IN_USE.`,
        "Swap vehicle or wait until the unit is free.",
        [{ action: "swap_vehicle", label: "Swap vehicle" }],
        { vehicleId: vehicle.id },
      ),
    );
  }

  if (vehicle.inspectionExpiry && vehicle.inspectionExpiry < now) {
    conflicts.push(
      buildConflict(
        [dispatch.id, "vehicle.inspection_expired", vehicle.id],
        "vehicle.inspection_expired",
        "critical",
        "Inspection expired",
        `${vehicle.plateNumber} inspection expired ${formatConflictDate(vehicle.inspectionExpiry)}.`,
        "Swap vehicle or renew inspection.",
        [{ action: "swap_vehicle", label: "Swap vehicle" }],
        { vehicleId: vehicle.id, inspectionExpiry: vehicle.inspectionExpiry.toISOString() },
      ),
    );
  }

  if (vehicle.insuranceExpiry && vehicle.insuranceExpiry < now) {
    conflicts.push(
      buildConflict(
        [dispatch.id, "vehicle.insurance_expired", vehicle.id],
        "vehicle.insurance_expired",
        "high",
        "Insurance expired",
        `${vehicle.plateNumber} insurance expired ${formatConflictDate(vehicle.insuranceExpiry)}.`,
        "Swap vehicle or renew insurance.",
        [{ action: "swap_vehicle", label: "Swap vehicle" }],
        { vehicleId: vehicle.id, insuranceExpiry: vehicle.insuranceExpiry.toISOString() },
      ),
    );
  }

  const vehicleReservation = reservations.find((r) => r.vehicleId === vehicle.id);
  if (vehicleReservation) {
    conflicts.push(
      buildConflict(
        [dispatch.id, "vehicle.assigned", vehicle.id, vehicleReservation.reference],
        "vehicle.assigned",
        "critical",
        "Vehicle already assigned",
        `${vehicle.plateNumber} is committed to ${vehicleReservation.reference}.`,
        "Choose another vehicle or reschedule this dispatch.",
        [
          {
            action: "swap_vehicle",
            label: "Swap vehicle",
            payload: { conflictingReference: vehicleReservation.reference },
          },
          { action: "reschedule", label: "Reschedule +30 min", payload: { shiftMinutes: 30 } },
        ],
        {
          vehicleId: vehicle.id,
          conflictingReference: vehicleReservation.reference,
        },
      ),
    );
  }

  // --- Capacity ---
  if (vehicle.capacityKg && order.cargoWeightKg && order.cargoWeightKg.gt(vehicle.capacityKg)) {
    conflicts.push(
      buildConflict(
        [dispatch.id, "capacity.weight", vehicle.id],
        "capacity.weight",
        "high",
        "Weight capacity exceeded",
        `Cargo ${order.cargoWeightKg.toString()} kg exceeds vehicle capacity ${vehicle.capacityKg.toString()} kg.`,
        "Assign a larger vehicle or split the shipment.",
        [{ action: "larger_vehicle", label: "Find larger vehicle" }],
        {
          cargoWeightKg: order.cargoWeightKg.toString(),
          capacityKg: vehicle.capacityKg.toString(),
        },
      ),
    );
  }
  if (vehicle.capacityM3 && order.cargoVolumeM3 && order.cargoVolumeM3.gt(vehicle.capacityM3)) {
    conflicts.push(
      buildConflict(
        [dispatch.id, "capacity.volume", vehicle.id],
        "capacity.volume",
        "high",
        "Volume capacity exceeded",
        `Cargo ${order.cargoVolumeM3.toString()} m³ exceeds vehicle capacity ${vehicle.capacityM3.toString()} m³.`,
        "Assign a larger vehicle or split the shipment.",
        [{ action: "larger_vehicle", label: "Find larger vehicle" }],
        {
          cargoVolumeM3: order.cargoVolumeM3.toString(),
          capacityM3: vehicle.capacityM3.toString(),
        },
      ),
    );
  }

  // --- Schedule ---
  const pickup = dispatch.pickupDateScheduled;
  const delivery = dispatch.deliveryDateScheduled;

  if (ACTIVE_STATUSES.has(dispatch.status) && pickup < now) {
    conflicts.push(
      buildConflict(
        [dispatch.id, "schedule.late_pickup"],
        "schedule.late_pickup",
        "high",
        "Late pickup",
        `Scheduled pickup was ${formatConflictDate(pickup)} — dispatch is still ${dispatch.status}.`,
        "Update status or reschedule pickup window.",
        [
          { action: "reschedule", label: "Reschedule +30 min", payload: { shiftMinutes: 30 } },
          { action: "ignore", label: "Ignore" },
        ],
        { pickupDateScheduled: pickup.toISOString(), status: dispatch.status },
        true,
      ),
    );
  }

  if (ACTIVE_STATUSES.has(dispatch.status) && delivery < now) {
    conflicts.push(
      buildConflict(
        [dispatch.id, "schedule.late_delivery"],
        "schedule.late_delivery",
        "high",
        "Late delivery",
        `Scheduled delivery was ${formatConflictDate(delivery)} — shipment is not delivered.`,
        "Reschedule delivery or escalate to customer.",
        [
          { action: "reschedule", label: "Reschedule +30 min", payload: { shiftMinutes: 30 } },
          { action: "ignore", label: "Ignore" },
        ],
        { deliveryDateScheduled: delivery.toISOString(), status: dispatch.status },
      ),
    );
  }

  if (delivery.getTime() - pickup.getTime() < 30 * 60 * 1000) {
    conflicts.push(
      buildConflict(
        [dispatch.id, "schedule.travel_impossible"],
        "schedule.travel_impossible",
        "high",
        "Schedule window too tight",
        "Pickup and delivery are less than 30 minutes apart — travel is unlikely.",
        "Extend the delivery window or reschedule.",
        [{ action: "reschedule", label: "Reschedule +30 min", payload: { shiftMinutes: 30 } }],
        {
          pickupDateScheduled: pickup.toISOString(),
          deliveryDateScheduled: delivery.toISOString(),
        },
      ),
    );
  }

  if (driverReservation) {
    conflicts.push(
      buildConflict(
        [dispatch.id, "schedule.dispatch_overlap", driverReservation.reference],
        "schedule.dispatch_overlap",
        "high",
        "Dispatch schedule overlap",
        `Overlaps with ${driverReservation.reference} on the same driver.`,
        "Reschedule or reassign crew.",
        [{ action: "reschedule", label: "Reschedule +30 min", payload: { shiftMinutes: 30 } }],
        { conflictingReference: driverReservation.reference },
      ),
    );
  }

  return conflicts;
}
