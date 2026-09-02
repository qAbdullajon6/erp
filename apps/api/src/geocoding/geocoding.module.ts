import { Module } from "@nestjs/common";
import { GeocodingService } from "./geocoding.service";
import { GeocodingController } from "./geocoding.controller";
import { LocationIQService } from "./locationiq.service";
import { GEOCODING_PROVIDER } from "./geocoding-provider.interface";
import { MapboxService } from "../telematics/mapbox/mapbox.service";

@Module({
  controllers: [GeocodingController],
  providers: [
    GeocodingService,
    // MapboxService is still required by GeocodingService (order/route geocoding).
    MapboxService,
    // LocationIQ is the provider for customer address suggest + reverse geocoding.
    LocationIQService,
    {
      provide: GEOCODING_PROVIDER,
      useExisting: LocationIQService,
    },
  ],
  exports: [GeocodingService],
})
export class GeocodingModule {}
