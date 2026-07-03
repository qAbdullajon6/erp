import { Injectable } from "@nestjs/common";
import { Driver, OrderStatus, Vehicle } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DispatchAvailabilityQueryDto } from "./dto/dispatch-availability-query.dto";

/// Same "currently in flight" set OrdersService uses for double-booking.
const ACTIVE_ASSIGNMENT_STATUSES: OrderStatus[] = ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"];

function toDriverSummary(driver: Driver) {
  return {
    id: driver.id,
    employeeCode: driver.employeeCode,
    firstName: driver.firstName,
    lastName: driver.lastName,
    phone: driver.phone,
    status: driver.status,
  };
}

function toVehicleSummary(vehicle: Vehicle) {
  return {
    id: vehicle.id,
    vehicleCode: vehicle.vehicleCode,
    plateNumber: vehicle.plateNumber,
    type: vehicle.type,
    capacityKg: vehicle.capacityKg?.toString() ?? null,
    capacityM3: vehicle.capacityM3?.toString() ?? null,
    status: vehicle.status,
  };
}

function toOrderSummary(order: {
  id: string;
  orderNumber: string;
  pickupCity: string;
  deliveryCity: string;
  pickupDate: Date;
  deliveryDate: Date;
  status: OrderStatus;
}) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    pickupCity: order.pickupCity,
    deliveryCity: order.deliveryCity,
    pickupDate: order.pickupDate,
    deliveryDate: order.deliveryDate,
    status: order.status,
  };
}

@Injectable()
export class DispatchService {
  constructor(private readonly prisma: PrismaService) {}

  /// A read-only aggregation for the Dispatch Board: unassigned (PENDING)
  /// orders, and drivers/vehicles split by their administrative status
  /// (Driver.status / Vehicle.status — a coarse, manually-managed field)
  /// further cross-referenced against orders currently ASSIGNED/PICKED_UP/
  /// IN_TRANSIT to compute who's actually busy right now vs. genuinely free.
  /// Deliberately reads Prisma directly rather than depending on
  /// Drivers/VehiclesService, to keep this module decoupled from theirs.
  async board(organizationId: string) {
    const [unassignedOrders, drivers, vehicles, activeOrders] = await Promise.all([
      this.prisma.order.findMany({
        where: { organizationId, status: "PENDING" },
        orderBy: { pickupDate: "asc" },
      }),
      this.prisma.driver.findMany({ where: { organizationId, archivedAt: null } }),
      this.prisma.vehicle.findMany({ where: { organizationId, archivedAt: null } }),
      this.prisma.order.findMany({
        where: { organizationId, status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
      }),
    ]);

    const orderByDriverId = new Map(
      activeOrders.filter((o) => o.driverId).map((o) => [o.driverId as string, o]),
    );
    const orderByVehicleId = new Map(
      activeOrders.filter((o) => o.vehicleId).map((o) => [o.vehicleId as string, o]),
    );

    return {
      unassignedOrders: unassignedOrders.map(toOrderSummary),
      drivers: {
        available: drivers
          .filter((d) => d.status === "ACTIVE" && !orderByDriverId.has(d.id))
          .map(toDriverSummary),
        busy: drivers
          .filter((d) => d.status === "ACTIVE" && orderByDriverId.has(d.id))
          .map((d) => ({
            driver: toDriverSummary(d),
            currentOrder: toOrderSummary(orderByDriverId.get(d.id)!),
          })),
        onLeave: drivers.filter((d) => d.status === "ON_LEAVE").map(toDriverSummary),
        inactive: drivers.filter((d) => d.status === "INACTIVE").map(toDriverSummary),
      },
      vehicles: {
        available: vehicles
          .filter((v) => v.status === "AVAILABLE" && !orderByVehicleId.has(v.id))
          .map(toVehicleSummary),
        busy: vehicles
          .filter((v) => v.status === "AVAILABLE" && orderByVehicleId.has(v.id))
          .map((v) => ({
            vehicle: toVehicleSummary(v),
            currentOrder: toOrderSummary(orderByVehicleId.get(v.id)!),
          })),
        inUse: vehicles.filter((v) => v.status === "IN_USE").map(toVehicleSummary),
        maintenance: vehicles.filter((v) => v.status === "MAINTENANCE").map(toVehicleSummary),
        inactive: vehicles.filter((v) => v.status === "INACTIVE").map(toVehicleSummary),
      },
    };
  }

  /// Who's assignable right now (or for a given date range). Without dates,
  /// this is just the administrative snapshot (ACTIVE drivers, AVAILABLE
  /// vehicles). With both `pickupDate` and `deliveryDate`, it additionally
  /// excludes anyone with an overlapping ASSIGNED/PICKED_UP/IN_TRANSIT order
  /// in that range — the same rule OrdersService.assign enforces, exposed
  /// here so the frontend can pre-check before submitting an assignment.
  async availability(organizationId: string, query: DispatchAvailabilityQueryDto) {
    const [drivers, vehicles] = await Promise.all([
      this.prisma.driver.findMany({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
      this.prisma.vehicle.findMany({ where: { organizationId, archivedAt: null, status: "AVAILABLE" } }),
    ]);

    if (!query.pickupDate || !query.deliveryDate) {
      return {
        drivers: drivers.map(toDriverSummary),
        vehicles: vehicles.map(toVehicleSummary),
      };
    }

    const pickupDate = new Date(query.pickupDate);
    const deliveryDate = new Date(query.deliveryDate);

    const overlapping = await this.prisma.order.findMany({
      where: {
        organizationId,
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        pickupDate: { lte: deliveryDate },
        deliveryDate: { gte: pickupDate },
      },
      select: { driverId: true, vehicleId: true },
    });
    const busyDriverIds = new Set(overlapping.filter((o) => o.driverId).map((o) => o.driverId));
    const busyVehicleIds = new Set(overlapping.filter((o) => o.vehicleId).map((o) => o.vehicleId));

    return {
      drivers: drivers.filter((d) => !busyDriverIds.has(d.id)).map(toDriverSummary),
      vehicles: vehicles.filter((v) => !busyVehicleIds.has(v.id)).map(toVehicleSummary),
    };
  }
}
