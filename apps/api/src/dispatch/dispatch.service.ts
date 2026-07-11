import { Injectable } from "@nestjs/common";
import { Driver, Vehicle } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AssignmentQueries, TripSummary } from "./assignment/assignment.queries";
import { DispatchAvailabilityQueryDto } from "./dto/dispatch-availability-query.dto";

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

function toOrderSummary(order: TripSummary) {
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignmentQueries: AssignmentQueries,
  ) {}

  /// A read-only aggregation for the Dispatch Board: unassigned (PENDING)
  /// orders, and drivers/vehicles split by their administrative status
  /// (Driver.status / Vehicle.status — a coarse, manually-managed field)
  /// cross-referenced against who is actually committed right now.
  ///
  /// "Committed right now" is deliberately NOT computed here: AssignmentQueries
  /// owns that definition (AR4), which is how the board finally agrees with the
  /// assignment checks. It used to derive busy-ness from orders alone, so a
  /// driver held by a dispatch showed up as free.
  async board(organizationId: string) {
    const [unassignedOrders, drivers, vehicles, reservations] = await Promise.all([
      this.prisma.order.findMany({
        where: { organizationId, status: "PENDING" },
        orderBy: { pickupDate: "asc" },
      }),
      this.prisma.driver.findMany({ where: { organizationId, archivedAt: null } }),
      this.prisma.vehicle.findMany({ where: { organizationId, archivedAt: null } }),
      // No window: the board asks "who is committed at all", not "who is free
      // between these dates".
      this.assignmentQueries.reservationsIn(organizationId),
    ]);

    const heldDriver = (id: string) =>
      AssignmentQueries.reservationFor(reservations, "driverId", id);
    const heldVehicle = (id: string) =>
      AssignmentQueries.reservationFor(reservations, "vehicleId", id);

    return {
      unassignedOrders: unassignedOrders.map(toOrderSummary),
      drivers: {
        available: drivers
          .filter((d) => d.status === "ACTIVE" && !heldDriver(d.id))
          .map(toDriverSummary),
        busy: drivers
          .filter((d) => d.status === "ACTIVE" && heldDriver(d.id))
          .map((d) => ({
            driver: toDriverSummary(d),
            currentOrder: toOrderSummary(heldDriver(d.id)!.trip),
          })),
        onLeave: drivers.filter((d) => d.status === "ON_LEAVE").map(toDriverSummary),
        inactive: drivers.filter((d) => d.status === "INACTIVE").map(toDriverSummary),
      },
      vehicles: {
        available: vehicles
          .filter((v) => v.status === "AVAILABLE" && !heldVehicle(v.id))
          .map(toVehicleSummary),
        busy: vehicles
          .filter((v) => v.status === "AVAILABLE" && heldVehicle(v.id))
          .map((v) => ({
            vehicle: toVehicleSummary(v),
            currentOrder: toOrderSummary(heldVehicle(v.id)!.trip),
          })),
        inUse: vehicles.filter((v) => v.status === "IN_USE").map(toVehicleSummary),
        maintenance: vehicles.filter((v) => v.status === "MAINTENANCE").map(toVehicleSummary),
        inactive: vehicles.filter((v) => v.status === "INACTIVE").map(toVehicleSummary),
      },
    };
  }

  /// Who is assignable right now (or for a given date range). Without dates,
  /// this is just the administrative snapshot (ACTIVE drivers, AVAILABLE
  /// vehicles). With both `pickupDate` and `deliveryDate`, it additionally
  /// excludes anyone already committed in that window.
  ///
  /// This is the endpoint the frontend pre-checks against before submitting an
  /// assignment, so it MUST agree with AssignmentPolicy — and now it does, by
  /// construction, because both ask AssignmentQueries the same question (AR4).
  /// Previously they disagreed: this read orders, the dispatch check read
  /// dispatches, and the form could offer a driver the API would then reject.
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

    const reservations = await this.assignmentQueries.reservationsIn(organizationId, {
      pickupDate: new Date(query.pickupDate),
      deliveryDate: new Date(query.deliveryDate),
    });
    const busy = AssignmentQueries.busyResourceIds(reservations);

    return {
      drivers: drivers.filter((d) => !busy.driverIds.has(d.id)).map(toDriverSummary),
      vehicles: vehicles.filter((v) => !busy.vehicleIds.has(v.id)).map(toVehicleSummary),
    };
  }
}
