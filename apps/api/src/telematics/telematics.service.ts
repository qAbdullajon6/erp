import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { computeEta } from "./geo/eta.util";
import { TelematicsSettingsService } from "./settings/telematics-settings.service";

/// The read facade over the live telematics state — the live map, a single
/// vehicle's current picture, ETA, and the customer-facing "where is my order".
/// Every other consumer (the AI copilot tools, the public API, the customer
/// portal) reaches live data through here so they can never drift into a
/// different shape or a different tenant boundary.
@Injectable()
export class TelematicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TelematicsSettingsService,
  ) {}

  /// The whole fleet's current positions — one indexed read of the live-state
  /// table, never a scan of the position stream. `isStale` is derived on read
  /// so a vehicle whose device went quiet reads as stale even before the
  /// sweeper has flipped it to OFFLINE.
  async liveFleet(organizationId: string) {
    const [states, settings] = await Promise.all([
      this.prisma.vehicleTelematicsState.findMany({ where: { organizationId } }),
      this.settings.getOrCreate(organizationId),
    ]);
    if (states.length === 0) return { vehicles: [], generatedAt: new Date() };

    const vehicleIds = states.map((s) => s.vehicleId);
    const driverIds = states.map((s) => s.driverId).filter((id): id is string => !!id);
    const [vehicles, drivers] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds }, organizationId }, select: { id: true, vehicleCode: true, plateNumber: true, type: true, status: true } }),
      driverIds.length > 0
        ? this.prisma.driver.findMany({ where: { id: { in: driverIds }, organizationId }, select: { id: true, firstName: true, lastName: true } })
        : Promise.resolve([]),
    ]);
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const driverById = new Map(drivers.map((d) => [d.id, d]));
    const now = Date.now();
    const staleMs = settings.offlineThresholdSec * 1000;

    return {
      generatedAt: new Date(),
      vehicles: states.map((s) => {
        const v = vehicleById.get(s.vehicleId);
        const d = s.driverId ? driverById.get(s.driverId) : null;
        const isStale = !s.lastReceivedAt || now - s.lastReceivedAt.getTime() > staleMs;
        return {
          vehicleId: s.vehicleId,
          vehicleCode: v?.vehicleCode ?? null,
          plateNumber: v?.plateNumber ?? null,
          type: v?.type ?? null,
          latitude: s.latitude,
          longitude: s.longitude,
          speedKph: s.speedKph,
          heading: s.heading,
          movementState: isStale && s.movementState !== "OFFLINE" ? "OFFLINE" : s.movementState,
          isStale,
          driverId: s.driverId,
          driverName: d ? `${d.firstName} ${d.lastName}` : null,
          tripId: s.tripId,
          lastRecordedAt: s.lastRecordedAt,
          lastReceivedAt: s.lastReceivedAt,
        };
      }),
    };
  }

  async liveVehicle(organizationId: string, vehicleId: string, trailLimit = 50) {
    const state = await this.prisma.vehicleTelematicsState.findFirst({ where: { organizationId, vehicleId } });
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId }, select: { id: true, vehicleCode: true, plateNumber: true, type: true } });
    if (!vehicle) throw new NotFoundException("Vehicle not found");

    const [trail, activeTrip] = await Promise.all([
      this.prisma.gpsPosition.findMany({
        where: { organizationId, vehicleId },
        orderBy: { recordedAt: "desc" },
        take: trailLimit,
        select: { recordedAt: true, latitude: true, longitude: true, speedKph: true, heading: true, movementState: true },
      }),
      this.prisma.trip.findFirst({ where: { organizationId, vehicleId, status: "ACTIVE" }, orderBy: { startedAt: "desc" } }),
    ]);

    return {
      vehicle: { id: vehicle.id, vehicleCode: vehicle.vehicleCode, plateNumber: vehicle.plateNumber, type: vehicle.type },
      state: state
        ? {
            latitude: state.latitude,
            longitude: state.longitude,
            speedKph: state.speedKph,
            heading: state.heading,
            movementState: state.movementState,
            driverId: state.driverId,
            tripId: state.tripId,
            lastRecordedAt: state.lastRecordedAt,
            lastReceivedAt: state.lastReceivedAt,
          }
        : null,
      activeTrip: activeTrip
        ? { id: activeTrip.id, startedAt: activeTrip.startedAt, distanceKm: activeTrip.distanceKm.toString(), dispatchId: activeTrip.dispatchId, orderId: activeTrip.orderId }
        : null,
      // Reversed so the trail is oldest → newest for drawing.
      trail: trail.reverse().map((p) => ({ at: p.recordedAt, lat: p.latitude, lng: p.longitude, speedKph: p.speedKph, heading: p.heading, movementState: p.movementState })),
    };
  }

  /// ETA from a vehicle's live position to an explicit destination point.
  ///
  /// The destination is supplied as coordinates by the caller — this system
  /// stores delivery addresses as text, not lat/lng, so address→coordinate
  /// geocoding is out of scope (see TD-TELEMATICS-04). Given a point, the ETA
  /// itself is the fully-implemented kinematic estimate.
  async estimateEta(
    organizationId: string,
    vehicleId: string,
    destination: { latitude: number; longitude: number },
  ) {
    const state = await this.prisma.vehicleTelematicsState.findFirst({ where: { organizationId, vehicleId } });
    if (!state || state.latitude == null || state.longitude == null) {
      throw new NotFoundException("No live position for this vehicle yet");
    }
    const activeTrip = await this.prisma.trip.findFirst({ where: { organizationId, vehicleId, status: "ACTIVE" }, orderBy: { startedAt: "desc" }, select: { avgSpeedKph: true } });

    const eta = computeEta({
      current: { latitude: state.latitude, longitude: state.longitude },
      destination,
      recentSpeedKph: state.speedKph,
      avgSpeedKph: activeTrip?.avgSpeedKph ?? null,
    });

    return {
      vehicleId,
      from: { latitude: state.latitude, longitude: state.longitude },
      destination,
      remainingKm: Math.round(eta.remainingKm * 100) / 100,
      effectiveSpeedKph: Math.round(eta.effectiveSpeedKph),
      etaSeconds: eta.etaSeconds,
      etaMinutes: Math.round(eta.etaSeconds / 60),
      etaAt: eta.etaAt,
      estimate: true,
    };
  }

  /// Historical playback of one vehicle's raw fixes over a bounded time
  /// window — the scrubber behind the "replay yesterday" view. Always
  /// range-bounded and capped so it can never scan the whole position stream.
  async historicalPlayback(
    organizationId: string,
    vehicleId: string,
    range: { from: string; to: string; limit: number },
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId }, select: { id: true } });
    if (!vehicle) throw new NotFoundException("Vehicle not found");

    const points = await this.prisma.gpsPosition.findMany({
      where: { organizationId, vehicleId, recordedAt: { gte: new Date(range.from), lte: new Date(range.to) } },
      orderBy: { recordedAt: "asc" },
      take: range.limit,
      select: { recordedAt: true, latitude: true, longitude: true, speedKph: true, heading: true, movementState: true, tripId: true },
    });
    return {
      vehicleId,
      from: range.from,
      to: range.to,
      pointCount: points.length,
      points: points.map((p) => ({ at: p.recordedAt, lat: p.latitude, lng: p.longitude, speedKph: p.speedKph, heading: p.heading, movementState: p.movementState, tripId: p.tripId })),
    };
  }

  /// Customer-facing tracking for a single order. The caller (customer-portal
  /// controller) is responsible for proving the order belongs to the customer;
  /// this returns the minimal position/ETA payload with no driver PII.
  async trackForOrder(organizationId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organizationId },
      select: { id: true, status: true, vehicleId: true, deliveryCity: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (!order.vehicleId) {
      return { orderId, status: order.status, tracking: null, message: "No vehicle assigned yet" };
    }
    const state = await this.prisma.vehicleTelematicsState.findFirst({ where: { organizationId, vehicleId: order.vehicleId } });
    if (!state || state.latitude == null || state.longitude == null) {
      return { orderId, status: order.status, tracking: null, message: "Live tracking not available yet" };
    }
    return {
      orderId,
      status: order.status,
      tracking: {
        latitude: state.latitude,
        longitude: state.longitude,
        speedKph: state.speedKph,
        heading: state.heading,
        movementState: state.movementState,
        lastUpdatedAt: state.lastRecordedAt,
      },
    };
  }
}
