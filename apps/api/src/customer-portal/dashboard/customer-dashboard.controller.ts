import { Controller, Get, UseGuards } from "@nestjs/common";
import { CustomerJwtAuthGuard } from "../auth/guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import { CustomerDashboardService } from "./customer-dashboard.service";

@Controller("customer-portal/dashboard")
@UseGuards(CustomerJwtAuthGuard)
export class CustomerDashboardController {
  constructor(private readonly svc: CustomerDashboardService) {}

  @Get()
  get(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.svc.getDashboard(customer);
  }
}
