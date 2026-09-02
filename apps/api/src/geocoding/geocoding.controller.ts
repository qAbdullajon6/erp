import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import {
  GEOCODING_PROVIDER,
  type GeocodingProvider,
} from "./geocoding-provider.interface";
import { PlaceSuggestQueryDto } from "./dto/place-suggest-query.dto";
import { ReverseGeocodeQueryDto } from "./dto/reverse-geocode-query.dto";

/// Read access — same roles as the Customers list endpoint.
const READ_ROLES: MembershipRole[] = [
  "ADMIN",
  "SALES_CRM_MANAGER",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "ACCOUNTANT",
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("geocoding")
export class GeocodingController {
  constructor(
    @Inject(GEOCODING_PROVIDER)
    private readonly provider: GeocodingProvider,
  ) {}

  /// City/place autocomplete for address forms.
  /// Backed by LocationIQ (OSM data) — significantly better street-level
  /// and postal-code coverage for Uzbekistan and Central Asia than Mapbox.
  @Roles(...READ_ROLES)
  @Get("suggest")
  suggest(@Query() dto: PlaceSuggestQueryDto) {
    return this.provider.suggestPlaces(dto.q, {
      country: dto.country,
      limit: dto.limit,
    });
  }

  /// Reverse-geocode a lat/lng to structured address (street, postcode, city …).
  /// Backed by LocationIQ — returns street-level data for Uzbekistan where
  /// Mapbox only returned city/place names.
  @Roles(...READ_ROLES)
  @Get("reverse")
  reverse(@Query() dto: ReverseGeocodeQueryDto) {
    return this.provider.reverseGeocode({ lat: dto.lat, lng: dto.lng });
  }
}
