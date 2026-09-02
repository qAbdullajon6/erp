import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MapboxService } from "../telematics/mapbox/mapbox.service";

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mapbox: MapboxService,
  ) {}

  /// Forward-geocode a free-text query. Returns null when Mapbox is
  /// unconfigured, returns no result, or any network/API error occurs — the
  /// geocoding path is always best-effort and must never fail the caller.
  async geocodeAddress(query: string): Promise<{ lat: number; lng: number; placeName: string } | null> {
    if (!this.mapbox.isConfigured()) return null;
    try {
      return await this.mapbox.forwardGeocode(query);
    } catch (err) {
      this.logger.warn(
        `Forward geocoding failed for "${query.slice(0, 80)}": ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /// Geocode the pickup and delivery addresses for an order and persist the
  /// results. Each stop is processed independently — a pickup success does not
  /// depend on delivery success and vice versa. Stops already geocoded
  /// (geocodedAt is non-null) are skipped unless their address has been
  /// cleared (geocodedAt was set to null by the update path).
  ///
  /// Safe to call fire-and-forget: all errors are swallowed after logging so
  /// they never propagate to the HTTP request that triggered this.
  async geocodeOrderLocations(orderId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId },
      select: {
        id: true,
        pickupAddress: true,
        pickupCity: true,
        pickupGeocodedAt: true,
        deliveryAddress: true,
        deliveryCity: true,
        deliveryGeocodedAt: true,
      },
    });
    if (!order) return;

    const updates: Prisma.OrderUpdateInput = {};
    let anyGeocoded = false;

    if (!order.pickupGeocodedAt) {
      const query = [order.pickupAddress, order.pickupCity].filter(Boolean).join(", ");
      const result = await this.geocodeAddress(query);
      if (result) {
        updates.pickupLat = new Prisma.Decimal(result.lat);
        updates.pickupLng = new Prisma.Decimal(result.lng);
        updates.pickupGeocodedAt = new Date();
        anyGeocoded = true;
        this.logger.debug(`Geocoded pickup for order ${orderId}: ${result.lat},${result.lng}`);
      }
    }

    if (!order.deliveryGeocodedAt) {
      const query = [order.deliveryAddress, order.deliveryCity].filter(Boolean).join(", ");
      const result = await this.geocodeAddress(query);
      if (result) {
        updates.deliveryLat = new Prisma.Decimal(result.lat);
        updates.deliveryLng = new Prisma.Decimal(result.lng);
        updates.deliveryGeocodedAt = new Date();
        anyGeocoded = true;
        this.logger.debug(`Geocoded delivery for order ${orderId}: ${result.lat},${result.lng}`);
      }
    }

    if (anyGeocoded) {
      updates.geocodeSource = "mapbox";
      await this.prisma.order.update({ where: { id: orderId }, data: updates });
    }
  }

  /// Geocode a RouteStop by address+city and persist the coordinates.
  /// Only updates when the stop has no coordinates yet (lat is null).
  /// Safe to call fire-and-forget: all errors are swallowed after logging.
  async geocodeRouteStop(routeStopId: string, address: string, city: string): Promise<void> {
    try {
      const stop = await this.prisma.routeStop.findFirst({
        where: { id: routeStopId },
        select: { id: true, lat: true },
      });
      if (!stop || stop.lat != null) return;

      const query = [address, city].filter(Boolean).join(", ");
      const result = await this.geocodeAddress(query);
      if (!result) return;

      await this.prisma.routeStop.update({
        where: { id: routeStopId },
        data: { lat: new Prisma.Decimal(result.lat), lng: new Prisma.Decimal(result.lng) },
      });
      this.logger.debug(`Geocoded route stop ${routeStopId}: ${result.lat},${result.lng}`);
    } catch (err) {
      this.logger.warn(
        `geocodeRouteStop(${routeStopId}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
