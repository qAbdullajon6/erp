import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { Roles } from "../../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { DirectionsRequestDto, ReverseGeocodeQueryDto } from "../dto/mapbox.dto";
import { MapboxService } from "../mapbox/mapbox.service";

const OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

/// Fleet Tracking map helpers backed by Mapbox secret token.
/// Public tiles stay on the browser via VITE_MAPBOX_ACCESS_TOKEN.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tracking/map")
export class TrackingMapController {
  constructor(private readonly mapbox: MapboxService) {}

  @Roles(...OPS)
  @Get("status")
  status() {
    return {
      configured: this.mapbox.isConfigured(),
      provider: "mapbox",
    };
  }

  @Roles(...OPS)
  @Post("directions")
  directions(@Body() dto: DirectionsRequestDto) {
    return this.mapbox.directions({
      origin: dto.origin,
      destination: dto.destination,
      waypoints: dto.waypoints,
    });
  }

  @Roles(...OPS)
  @Get("reverse-geocode")
  reverseGeocode(@Query() query: ReverseGeocodeQueryDto) {
    return this.mapbox.reverseGeocode({ lat: query.lat, lng: query.lng });
  }
}
