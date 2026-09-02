import { Module } from "@nestjs/common";
import { GeocodingModule } from "../geocoding/geocoding.module";
import { TelematicsModule } from "../telematics/telematics.module";
import { RouteCalculationService } from "./route-calculation.service";
import { RouteOptimizationService } from "./route-optimization.service";
import { RoutesController } from "./routes.controller";
import { RoutesService } from "./routes.service";

@Module({
  imports: [TelematicsModule, GeocodingModule],
  controllers: [RoutesController],
  providers: [RoutesService, RouteCalculationService, RouteOptimizationService],
  exports: [RoutesService],
})
export class RoutesModule {}
