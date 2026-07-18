import { Module } from "@nestjs/common";
import { DeveloperModule } from "../developer/developer.module";
import { OrdersModule } from "../orders/orders.module";
import { CustomersModule } from "../customers/customers.module";
import { DriversModule } from "../drivers/drivers.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { TelematicsModule } from "../telematics/telematics.module";
import { PublicApiController } from "./public-api.controller";

/// The /v1 third-party surface.
///
/// Deliberately NOT part of DeveloperModule, even though it is what
/// DeveloperModule's API keys exist to unlock. DeveloperModule is imported by
/// WorkflowsModule (for WebhookEventService), and the domain modules this
/// controller needs import WorkflowsModule — so folding these controllers into
/// DeveloperModule would close the loop:
///
///   Orders -> Workflows -> Developer -> Orders   (circular)
///
/// Keeping the public surface in its own leaf module that depends on both
/// sides keeps every arrow pointing one way. Nothing imports this module.
@Module({
  imports: [DeveloperModule, OrdersModule, CustomersModule, DriversModule, VehiclesModule, TelematicsModule],
  controllers: [PublicApiController],
})
export class PublicApiModule {}
