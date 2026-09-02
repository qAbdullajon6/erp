import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RouteStatus } from "@prisma/client";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { GeocodingService } from "../geocoding/geocoding.service";
import { PrismaService } from "../prisma/prisma.service";
import { RouteCalculationService } from "./route-calculation.service";
import { generateUniqueRouteNumber } from "./route-number.util";
import { AddRouteStopDto } from "./dto/add-route-stop.dto";
import { CreateRouteDto } from "./dto/create-route.dto";
import { ListRoutesQueryDto } from "./dto/list-routes-query.dto";
import { ReorderRouteStopsDto } from "./dto/reorder-route-stops.dto";
import { UpdateRouteDto } from "./dto/update-route.dto";

const ROUTE_INCLUDE = {
  driver: { select: { id: true, employeeCode: true, firstName: true, lastName: true, phone: true } },
  vehicle: { select: { id: true, vehicleCode: true, plateNumber: true, type: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  stops: {
    orderBy: { sequence: "asc" as const },
    include: {
      order: { select: { id: true, orderNumber: true } },
      dispatch: {
        select: {
          id: true,
          dispatchNumber: true,
          status: true,
          vehicleId: true,
          driverId: true,
          failureReason: true,
          failureNotes: true,
          failedAt: true,
          stops: {
            orderBy: { stopIndex: "asc" as const },
            select: {
              id: true,
              stopIndex: true,
              stopType: true,
              arrivedAt: true,
              completedAt: true,
              failedAt: true,
              failureReason: true,
              failureNotes: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.RouteInclude;

/// Allowed status transitions for routes.
const ALLOWED_ROUTE_TRANSITIONS: Record<RouteStatus, RouteStatus[]> = {
  DRAFT: ["PLANNED", "CANCELLED"],
  PLANNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculation: RouteCalculationService,
    private readonly geocoding: GeocodingService,
  ) {}

  async create(organizationId: string, user: CurrentUserPayload, dto: CreateRouteDto) {
    if (dto.driverId) await this.validateDriver(organizationId, dto.driverId);
    if (dto.vehicleId) await this.validateVehicle(organizationId, dto.vehicleId);

    const route = await this.prisma.$transaction(async (tx) => {
      const routeNumber = await generateUniqueRouteNumber(tx, organizationId);
      return tx.route.create({
        data: {
          organizationId,
          routeNumber,
          plannedDate: new Date(dto.plannedDate),
          driverId: dto.driverId ?? null,
          vehicleId: dto.vehicleId ?? null,
          startTime: dto.startTime ? new Date(dto.startTime) : null,
          endTime: dto.endTime ? new Date(dto.endTime) : null,
          notes: dto.notes ?? null,
          createdByUserId: user.userId,
        },
        include: ROUTE_INCLUDE,
      });
    });

    return route;
  }

  async list(organizationId: string, query: ListRoutesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.RouteWhereInput = { organizationId };
    if (query.status) where.status = query.status;
    if (query.driverId) where.driverId = query.driverId;
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.fromDate || query.toDate) {
      where.plannedDate = {};
      if (query.fromDate) where.plannedDate.gte = new Date(query.fromDate);
      if (query.toDate) where.plannedDate.lte = new Date(query.toDate);
    }

    const [items, total] = await Promise.all([
      this.prisma.route.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ plannedDate: "desc" }, { createdAt: "desc" }],
        include: ROUTE_INCLUDE,
      }),
      this.prisma.route.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(organizationId: string, id: string) {
    const route = await this.prisma.route.findFirst({
      where: { id, organizationId },
      include: ROUTE_INCLUDE,
    });
    if (!route) throw new NotFoundException(`Route ${id} not found`);
    return route;
  }

  async update(organizationId: string, id: string, dto: UpdateRouteDto) {
    const route = await this.getById(organizationId, id);

    if (dto.status) {
      const allowed = ALLOWED_ROUTE_TRANSITIONS[route.status];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Cannot transition route from ${route.status} to ${dto.status}`,
        );
      }
      if (dto.status === "COMPLETED") {
        const TERMINAL_DISPATCH = ["DELIVERED", "CANCELLED", "DELIVERY_FAILED"] as const;
        const activeStops = route.stops.filter(
          (s) => s.dispatch && !(TERMINAL_DISPATCH as readonly string[]).includes(s.dispatch.status),
        );
        if (activeStops.length > 0) {
          const list = activeStops
            .map((s) => `${s.dispatch!.dispatchNumber} (${s.dispatch!.status})`)
            .join(", ");
          throw new BadRequestException(
            `Cannot complete route: ${activeStops.length} dispatch(es) still active: ${list}`,
          );
        }
      }
      if (dto.status === "PLANNED") {
        if (!route.driverId && !dto.driverId) {
          throw new BadRequestException("A driver must be assigned before planning a route");
        }
        if (!route.vehicleId && !dto.vehicleId) {
          throw new BadRequestException("A vehicle must be assigned before planning a route");
        }
        if (route.stops.length === 0) {
          throw new BadRequestException("A route must have at least one stop before planning");
        }
      }
    }

    if (dto.driverId) await this.validateDriver(organizationId, dto.driverId);
    if (dto.vehicleId) await this.validateVehicle(organizationId, dto.vehicleId);

    return this.prisma.route.update({
      where: { id },
      data: {
        ...(dto.plannedDate ? { plannedDate: new Date(dto.plannedDate) } : {}),
        ...(dto.driverId !== undefined ? { driverId: dto.driverId } : {}),
        ...(dto.vehicleId !== undefined ? { vehicleId: dto.vehicleId } : {}),
        ...(dto.startTime !== undefined ? { startTime: dto.startTime ? new Date(dto.startTime) : null } : {}),
        ...(dto.endTime !== undefined ? { endTime: dto.endTime ? new Date(dto.endTime) : null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      include: ROUTE_INCLUDE,
    });
  }

  async addStop(organizationId: string, routeId: string, dto: AddRouteStopDto) {
    const route = await this.getById(organizationId, routeId);
    this.assertEditable(route);

    if (dto.orderId) {
      await this.validateOrder(organizationId, dto.orderId);
      // Prevent adding the same order twice on one route
      const duplicate = route.stops.find((s) => s.orderId === dto.orderId);
      if (duplicate) {
        throw new ConflictException(`Order ${dto.orderId} is already on this route (stop #${duplicate.sequence})`);
      }
    }
    if (dto.dispatchId) {
      const dispatch = await this.validateDispatch(organizationId, dto.dispatchId);

      const dupDispatch = route.stops.find((s) => s.dispatchId === dto.dispatchId);
      if (dupDispatch) {
        throw new ConflictException(
          `Dispatch ${dto.dispatchId} is already on this route (stop #${dupDispatch.sequence})`,
        );
      }

      const conflict = await this.prisma.routeStop.findFirst({
        where: {
          dispatchId: dto.dispatchId,
          routeId: { not: routeId },
          route: { status: { not: "CANCELLED" as RouteStatus } },
        },
        include: { route: { select: { routeNumber: true, status: true } } },
      });
      if (conflict) {
        throw new ConflictException(
          `Dispatch ${dto.dispatchId} is already assigned to route ${conflict.route.routeNumber} (${conflict.route.status})`,
        );
      }

      if (dto.orderId && dispatch.orderId !== dto.orderId) {
        throw new BadRequestException(
          `Dispatch ${dto.dispatchId} belongs to order ${dispatch.orderId}, not ${dto.orderId}`,
        );
      }
    }

    const nextSequence = route.stops.length > 0
      ? Math.max(...route.stops.map((s) => s.sequence)) + 1
      : 1;

    const stop = await this.prisma.routeStop.create({
      data: {
        organizationId,
        routeId,
        sequence: nextSequence,
        orderId: dto.orderId ?? null,
        dispatchId: dto.dispatchId ?? null,
        label: dto.label ?? null,
        address: dto.address,
        city: dto.city,
        lat: dto.lat ? new Prisma.Decimal(dto.lat) : null,
        lng: dto.lng ? new Prisma.Decimal(dto.lng) : null,
        plannedArrival: dto.plannedArrival ? new Date(dto.plannedArrival) : null,
        plannedDeparture: dto.plannedDeparture ? new Date(dto.plannedDeparture) : null,
        notes: dto.notes ?? null,
      },
      include: {
        order: { select: { id: true, orderNumber: true } },
        dispatch: { select: { id: true, dispatchNumber: true, status: true } },
      },
    });

    // Fire-and-forget geocoding when no coordinates were supplied
    if (!dto.lat || !dto.lng) {
      void this.geocoding.geocodeRouteStop(stop.id, dto.address, dto.city);
    }

    return stop;
  }

  async removeStop(organizationId: string, routeId: string, stopId: string) {
    const route = await this.getById(organizationId, routeId);
    this.assertEditable(route);

    const stop = route.stops.find((s) => s.id === stopId);
    if (!stop) throw new NotFoundException(`Stop ${stopId} not found on route ${routeId}`);

    await this.prisma.$transaction(async (tx) => {
      await tx.routeStop.delete({ where: { id: stopId } });
      // Compact sequences: renumber remaining stops in order
      const remaining = route.stops
        .filter((s) => s.id !== stopId)
        .sort((a, b) => a.sequence - b.sequence);
      for (let i = 0; i < remaining.length; i++) {
        await tx.routeStop.update({
          where: { id: remaining[i].id },
          data: { sequence: i + 1 },
        });
      }
    });
  }

  async reorderStops(organizationId: string, routeId: string, dto: ReorderRouteStopsDto) {
    const route = await this.getById(organizationId, routeId);
    this.assertEditable(route);

    const currentIds = new Set(route.stops.map((s) => s.id));
    const providedIds = new Set(dto.stopIds);

    if (
      currentIds.size !== providedIds.size ||
      ![...providedIds].every((id) => currentIds.has(id))
    ) {
      throw new BadRequestException(
        "stopIds must contain exactly the current stop IDs — no additions or omissions",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Two-pass: move to high offsets first to avoid unique(routeId,sequence) conflicts
      for (let i = 0; i < dto.stopIds.length; i++) {
        await tx.routeStop.update({
          where: { id: dto.stopIds[i] },
          data: { sequence: 10000 + i },
        });
      }
      for (let i = 0; i < dto.stopIds.length; i++) {
        await tx.routeStop.update({
          where: { id: dto.stopIds[i] },
          data: { sequence: i + 1 },
        });
      }
    });

    return this.getById(organizationId, routeId);
  }

  async calculateRoute(organizationId: string, routeId: string) {
    const route = await this.getById(organizationId, routeId);

    // Concurrent-calculation guard
    if (route.calculationStatus === "CALCULATING") {
      throw new ConflictException("A route calculation is already in progress for this route");
    }

    const stopsWithCoords = route.stops.filter((s) => s.lat != null && s.lng != null);
    const missingStopCount = route.stops.length - stopsWithCoords.length;

    if (stopsWithCoords.length < 2) {
      return {
        route,
        calculation: null,
        missingStopCount,
        message: "At least 2 stops with coordinates are required",
      };
    }

    // Mark as calculating before starting async work
    await this.prisma.route.update({
      where: { id: routeId },
      data: { calculationStatus: "CALCULATING" },
    });

    const coords = stopsWithCoords.map((s) => ({
      sequence: s.sequence,
      lat: Number(s.lat),
      lng: Number(s.lng),
    }));

    let calc;
    try {
      calc = await this.calculation.calculate(coords);
    } catch (err) {
      // Preserve previous result on total failure; mark failed
      await this.prisma.route.update({
        where: { id: routeId },
        data: { calculationStatus: "FAILED" },
      });
      throw err;
    }

    if (!calc) {
      await this.prisma.route.update({
        where: { id: routeId },
        data: { calculationStatus: "FAILED" },
      });
      return { route, calculation: null, missingStopCount, message: "Calculation returned no result" };
    }

    const now = new Date();
    const geometryJson = calc.geometry ? JSON.stringify(calc.geometry) : null;

    // Compute ETAs from route.startTime + cumulative leg durations
    const startTime = route.startTime;

    await this.prisma.$transaction(async (tx) => {
      await tx.route.update({
        where: { id: routeId },
        data: {
          totalDistanceM: calc!.totalDistanceM,
          totalDurationSec: calc!.totalDurationSec,
          calculatedAt: now,
          calculationStatus: calc!.calculationStatus,
          geometry: geometryJson,
        },
      });

      // Update per-stop metrics and ETAs
      let cumulativeDurationSec = 0;
      for (const stop of route.stops.sort((a, b) => a.sequence - b.sequence)) {
        const leg = calc!.legs.find((l) => l.toSequence === stop.sequence);
        const isFirstWithCoords = stop.sequence === stopsWithCoords[0]?.sequence;

        const updateData: Prisma.RouteStopUpdateInput = {};

        if (leg) {
          updateData.distanceFromPrevM = leg.distanceM;
          updateData.durationFromPrevSec = leg.durationSec;
          cumulativeDurationSec += leg.durationSec;
        } else if (isFirstWithCoords) {
          // First coord stop has no leg coming "to" it — cumulative stays 0
          cumulativeDurationSec = 0;
        }

        // Compute ETA only when startTime is set and stop has coordinates
        if (startTime && stop.lat != null) {
          const etaMs = startTime.getTime() + cumulativeDurationSec * 1000;
          updateData.plannedArrival = new Date(etaMs);
        }

        if (Object.keys(updateData).length > 0) {
          await tx.routeStop.update({ where: { id: stop.id }, data: updateData });
        }
      }
    });

    const updatedRoute = await this.getById(organizationId, routeId);
    return {
      route: updatedRoute,
      calculation: calc,
      missingStopCount,
      message: "Route calculated successfully",
    };
  }

  async delete(organizationId: string, id: string) {
    const route = await this.getById(organizationId, id);
    if (route.status === "IN_PROGRESS" || route.status === "COMPLETED") {
      throw new ForbiddenException(
        `Cannot delete a route with status ${route.status}. Cancel it first.`,
      );
    }
    await this.prisma.route.delete({ where: { id } });
  }

  private assertEditable(route: { status: RouteStatus; routeNumber: string }) {
    if (route.status === "IN_PROGRESS" || route.status === "COMPLETED" || route.status === "CANCELLED") {
      throw new BadRequestException(
        `Cannot modify stops on a route with status ${route.status}`,
      );
    }
  }

  private async validateDriver(organizationId: string, driverId: string) {
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, organizationId } });
    if (!driver) throw new NotFoundException(`Driver ${driverId} not found in this organization`);
  }

  private async validateVehicle(organizationId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId } });
    if (!vehicle) throw new NotFoundException(`Vehicle ${vehicleId} not found in this organization`);
  }

  private async validateOrder(organizationId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, organizationId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found in this organization`);
  }

  private async validateDispatch(organizationId: string, dispatchId: string) {
    const dispatch = await this.prisma.dispatch.findFirst({ where: { id: dispatchId, organizationId } });
    if (!dispatch) throw new NotFoundException(`Dispatch ${dispatchId} not found in this organization`);
    const TERMINAL = ["CANCELLED", "DELIVERED", "DELIVERY_FAILED"] as const;
    if ((TERMINAL as readonly string[]).includes(dispatch.status)) {
      throw new BadRequestException(
        `Dispatch ${dispatchId} has terminal status ${dispatch.status} and cannot be added to a route`,
      );
    }
    return dispatch;
  }
}
