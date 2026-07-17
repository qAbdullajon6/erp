import { Module } from "@nestjs/common";
import { BillingSeatsService } from "./billing-seats.service";

@Module({
  providers: [BillingSeatsService],
  exports: [BillingSeatsService],
})
export class BillingModule {}
