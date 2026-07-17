import { Controller, Get, Patch, Body, UseGuards } from "@nestjs/common";
import { CustomerJwtAuthGuard } from "../auth/guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import { CustomerProfileService } from "./customer-profile.service";
import { UpdateCustomerProfileDto } from "./dto/update-profile.dto";

@Controller("customer-portal/profile")
@UseGuards(CustomerJwtAuthGuard)
export class CustomerProfileController {
  constructor(private readonly svc: CustomerProfileService) {}

  @Get()
  getProfile(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.svc.getProfile(customer);
  }

  @Patch()
  updateProfile(
    @CurrentCustomer() customer: CurrentCustomerPayload,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    return this.svc.updateProfile(customer, dto);
  }
}
