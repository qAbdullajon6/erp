import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoutesService } from './routes.service';
import { optimizeStopSequence, OptimizableStop } from './route-optimizer';
import { ApplyOptimizationDto } from './dto/apply-optimization.dto';
import { UpdateRouteStopDto } from './dto/update-route-stop.dto';

const ACTIVE_DISPATCH_STATUSES = new Set([
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
  'AT_STOP',
  'ARRIVED_AT_DELIVERY',
]);

type RouteWithStops = Awaited<ReturnType<RoutesService['getById']>>;
type RouteStop = RouteWithStops['stops'][number];

function classifyFixed(stop: RouteStop): boolean {
  if (stop.optimizationLocked) return true;
  if (stop.status === 'COMPLETED' || stop.status === 'SKIPPED') return true;
  if (!stop.dispatch) return false;
  if (ACTIVE_DISPATCH_STATUSES.has(stop.dispatch.status)) return true;
  if (stop.dispatch.stops.some((ds) => ds.arrivedAt != null)) return true;
  return false;
}

function toOptimizable(stop: RouteStop): OptimizableStop {
  return {
    id: stop.id,
    sequence: stop.sequence,
    lat: stop.lat != null ? Number(stop.lat) : null,
    lng: stop.lng != null ? Number(stop.lng) : null,
    orderId: stop.orderId,
    isFixed: classifyFixed(stop),
  };
}

@Injectable()
export class RouteOptimizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routes: RoutesService,
  ) {}

  async preview(organizationId: string, routeId: string) {
    const route = await this.routes.getById(organizationId, routeId);
    this.assertOptimizable(route);

    const stops = route.stops.map(toOptimizable);
    const result = optimizeStopSequence(stops);

    return {
      routeUpdatedAt: route.updatedAt.toISOString(),
      optimized: result.feasible,
      currentDistance: result.currentDistanceM,
      optimizedDistance: result.proposedDistanceM,
      distanceSaved: result.distanceSavedM,
      currentSequence: result.currentSequence,
      proposedSequence: result.proposedSequence,
      warnings: result.warnings,
      changedStopIds: result.changedStopIds,
      eligibleCount: result.eligibleCount,
      fixedCount: result.fixedCount,
      missingCoordCount: result.missingCoordCount,
    };
  }

  async apply(organizationId: string, routeId: string, dto: ApplyOptimizationDto) {
    const clientUpdatedAt = new Date(dto.routeUpdatedAt);

    const applied = await this.prisma.$transaction(async (tx) => {
      // Re-fetch inside transaction for concurrency safety
      const route = await tx.route.findFirst({
        where: { id: routeId, organizationId },
        include: {
          stops: {
            orderBy: { sequence: 'asc' as const },
            include: {
              dispatch: {
                select: {
                  id: true,
                  status: true,
                  stops: {
                    select: { id: true, arrivedAt: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!route) throw new NotFoundException(`Route ${routeId} not found`);

      // Staleness check
      if (route.updatedAt.getTime() !== clientUpdatedAt.getTime()) {
        throw new ConflictException(
          'Route was modified since the preview was generated. Fetch a new preview and try again.',
        );
      }

      this.assertOptimizableRaw(route.status);

      const stops: OptimizableStop[] = route.stops.map((s) => ({
        id: s.id,
        sequence: s.sequence,
        lat: s.lat != null ? Number(s.lat) : null,
        lng: s.lng != null ? Number(s.lng) : null,
        orderId: s.orderId,
        isFixed: this.classifyFixedRaw(s),
      }));

      const result = optimizeStopSequence(stops);

      if (!result.feasible) {
        throw new BadRequestException(
          result.warnings.join(' ') || 'Route cannot be optimized.',
        );
      }

      if (result.changedStopIds.length === 0) {
        // Already optimal — nothing to write; update updatedAt to keep token fresh
        await tx.route.update({ where: { id: routeId }, data: { updatedAt: new Date() } });
        return { route, changedStopIds: [] };
      }

      // Two-pass sequence update to avoid unique(routeId, sequence) conflicts
      for (const entry of result.proposedSequence) {
        await tx.routeStop.update({
          where: { id: entry.id },
          data: { sequence: 10000 + entry.sequence },
        });
      }
      for (const entry of result.proposedSequence) {
        await tx.routeStop.update({
          where: { id: entry.id },
          data: { sequence: entry.sequence },
        });
      }

      // Bump route.updatedAt so the next token is fresh
      await tx.route.update({ where: { id: routeId }, data: { updatedAt: new Date() } });

      return { route, changedStopIds: result.changedStopIds };
    });

    // Fire-and-forget recalculation only when stops actually moved
    if (applied.changedStopIds.length > 0) {
      void this.routes.calculateRoute(organizationId, routeId).catch(() => undefined);
    }

    const updatedRoute = await this.routes.getById(organizationId, routeId);
    return { route: updatedRoute, changedStopIds: applied.changedStopIds };
  }

  async updateStop(
    organizationId: string,
    routeId: string,
    stopId: string,
    dto: UpdateRouteStopDto,
  ) {
    const route = await this.routes.getById(organizationId, routeId);
    const stop = route.stops.find((s) => s.id === stopId);
    if (!stop) throw new NotFoundException(`Stop ${stopId} not found on route ${routeId}`);

    if ('dispatchId' in dto) {
      if (dto.dispatchId === null) {
        if (stop.dispatch && ACTIVE_DISPATCH_STATUSES.has(stop.dispatch.status)) {
          throw new ConflictException(
            `Cannot unlink dispatch ${stop.dispatch.dispatchNumber} — it is currently ${stop.dispatch.status}`,
          );
        }
      } else {
        const dispatch = await this.prisma.dispatch.findFirst({
          where: { id: dto.dispatchId, organizationId },
        });
        if (!dispatch) throw new NotFoundException(`Dispatch ${dto.dispatchId} not found`);

        const TERMINAL = ['CANCELLED', 'DELIVERED', 'DELIVERY_FAILED'];
        if (TERMINAL.includes(dispatch.status)) {
          throw new BadRequestException(
            `Dispatch ${dto.dispatchId} has terminal status ${dispatch.status} and cannot be linked to a route stop`,
          );
        }

        const dupStop = route.stops.find(
          (s) => s.dispatchId === dto.dispatchId && s.id !== stopId,
        );
        if (dupStop) {
          throw new ConflictException(
            `Dispatch ${dto.dispatchId} is already on this route (stop #${dupStop.sequence})`,
          );
        }

        const conflict = await this.prisma.routeStop.findFirst({
          where: {
            dispatchId: dto.dispatchId,
            routeId: { not: routeId },
            route: { status: { notIn: ['CANCELLED', 'COMPLETED'] } },
          },
          include: { route: { select: { routeNumber: true, status: true } } },
        });
        if (conflict) {
          throw new ConflictException(
            `Dispatch ${dto.dispatchId} is already assigned to route ${conflict.route.routeNumber} (${conflict.route.status})`,
          );
        }
      }
    }

    return this.prisma.routeStop.update({
      where: { id: stopId },
      data: {
        ...(dto.optimizationLocked !== undefined
          ? { optimizationLocked: dto.optimizationLocked }
          : {}),
        ...('dispatchId' in dto ? { dispatchId: dto.dispatchId } : {}),
      },
      include: {
        order: { select: { id: true, orderNumber: true } },
        dispatch: { select: { id: true, dispatchNumber: true, status: true } },
      },
    });
  }

  private assertOptimizable(route: RouteWithStops) {
    this.assertOptimizableRaw(route.status);
  }

  private assertOptimizableRaw(status: string) {
    if (status === 'COMPLETED' || status === 'CANCELLED') {
      throw new ForbiddenException(
        `Cannot optimize a route with status ${status}`,
      );
    }
  }

  private classifyFixedRaw(stop: {
    status: string;
    optimizationLocked: boolean;
    dispatch: { status: string; stops: { arrivedAt: Date | null }[] } | null;
  }): boolean {
    if (stop.optimizationLocked) return true;
    if (stop.status === 'COMPLETED' || stop.status === 'SKIPPED') return true;
    if (!stop.dispatch) return false;
    if (ACTIVE_DISPATCH_STATUSES.has(stop.dispatch.status)) return true;
    if (stop.dispatch.stops.some((ds) => ds.arrivedAt != null)) return true;
    return false;
  }
}
