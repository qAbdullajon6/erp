import { Injectable, NotFoundException } from "@nestjs/common";
import { Driver, Prisma, Vehicle } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  DriverDoubleBookedError,
  DriverNotAssignableError,
  VehicleCapacityExceededError,
  VehicleDoubleBookedError,
  VehicleNotAssignableError,
} from "../dispatch.errors";
import { AssignmentQueries, ReservationExclusions, TimeWindow } from "./assignment.queries";

/// AssignmentPolicy — the ONE implementation of "may this driver and this vehicle
/// take this trip?" (AR1, AR3, AR4). It answers with domain errors, and it is the
/// only thing any endpoint may ask.
///
/// It is a policy, not a repository: it decides, it does not persist. Callers stay
/// responsible for writing (inside their transaction — AR2), which is why this
/// returns the driver and vehicle it loaded rather than making the caller fetch
/// them a second time.
///
/// The rules it owns, each of which previously existed in two or three copies:
///   - R12 eligibility: an ACTIVE, unarchived driver; an AVAILABLE, unarchived vehicle
///   - capacity: the cargo must fit (this one existed ONLY in OrdersService, so
///     creating a dispatch skipped it entirely until now)
///   - R5 no double-booking, via AssignmentQueries
///
/// This check is optimistic and remains a check-then-write: it exists to produce a
/// good error message BEFORE the write. The database exclusion constraints from
/// Task 8.2 are the actual guarantee, and Task 8.3 translates them into these very
/// same error types when a race gets past this point.
export interface AssignmentRequest {
  organizationId: string;
  driverId: string;
  vehicleId: string;
  /// The window the resources are being committed for.
  window: TimeWindow;
  /// The cargo being carried, if known. Capacity is only checked where both the
  /// cargo figure and the vehicle's corresponding capacity exist.
  cargoWeightKg?: Prisma.Decimal | null;
  cargoVolumeM3?: Prisma.Decimal | null;
  /// The record being assigned, so it does not conflict with itself.
  exclude?: ReservationExclusions;
}

@Injectable()
export class AssignmentPolicy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: AssignmentQueries,
  ) {}

  /// Throws unless the assignment is legal. Returns the validated driver and
  /// vehicle so the caller can write without re-reading them.
  async assertAssignable(request: AssignmentRequest): Promise<{ driver: Driver; vehicle: Vehicle }> {
    const { organizationId, driverId, vehicleId, window } = request;

    const [driver, vehicle] = await Promise.all([
      this.prisma.driver.findFirst({ where: { id: driverId, organizationId } }),
      this.prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId } }),
    ]);

    // Tenant-scoped lookups, so another organization's driver is "not found"
    // rather than "not assignable" — no existence leak (R14).
    if (!driver) {
      throw new NotFoundException("Driver not found");
    }
    if (!vehicle) {
      throw new NotFoundException("Vehicle not found");
    }

    if (driver.status !== "ACTIVE" || driver.archivedAt) {
      throw new DriverNotAssignableError();
    }
    if (vehicle.status !== "AVAILABLE" || vehicle.archivedAt) {
      throw new VehicleNotAssignableError();
    }

    this.assertCapacity(vehicle, request.cargoWeightKg ?? null, request.cargoVolumeM3 ?? null);

    const reservations = await this.queries.reservationsIn(
      organizationId,
      window,
      request.exclude ?? {},
    );

    const driverConflict = AssignmentQueries.reservationFor(reservations, "driverId", driverId);
    if (driverConflict) {
      throw new DriverDoubleBookedError(`dispatch ${driverConflict.reference}`);
    }

    const vehicleConflict = AssignmentQueries.reservationFor(reservations, "vehicleId", vehicleId);
    if (vehicleConflict) {
      throw new VehicleDoubleBookedError(`dispatch ${vehicleConflict.reference}`);
    }

    return { driver, vehicle };
  }

  /// Capacity is only checked when BOTH the vehicle's capacity field and the
  /// order's corresponding cargo field are present — there is nothing to validate
  /// against when either is missing.
  private assertCapacity(
    vehicle: Vehicle,
    cargoWeightKg: Prisma.Decimal | null,
    cargoVolumeM3: Prisma.Decimal | null,
  ): void {
    if (vehicle.capacityKg && cargoWeightKg && cargoWeightKg.gt(vehicle.capacityKg)) {
      throw new VehicleCapacityExceededError(
        "weight",
        cargoWeightKg.toString(),
        vehicle.capacityKg.toString(),
      );
    }
    if (vehicle.capacityM3 && cargoVolumeM3 && cargoVolumeM3.gt(vehicle.capacityM3)) {
      throw new VehicleCapacityExceededError(
        "volume",
        cargoVolumeM3.toString(),
        vehicle.capacityM3.toString(),
      );
    }
  }
}
