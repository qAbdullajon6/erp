import { Controller, Get, UseGuards } from "@nestjs/common";
import { CustomerJwtAuthGuard } from "../auth/guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import { CustomerPaymentsService } from "./customer-payments.service";

@Controller("customer-portal/payments")
@UseGuards(CustomerJwtAuthGuard)
export class CustomerPaymentsController {
  constructor(private readonly svc: CustomerPaymentsService) {}

  @Get()
  list(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.svc.list(customer);
  }

  @Get("summary")
  summary(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.svc.summary(customer);
  }
}
