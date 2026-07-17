import { Controller, Get, UseGuards } from "@nestjs/common";
import { CustomerJwtAuthGuard } from "../auth/guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import { CustomerDocumentsService } from "./customer-documents.service";

@Controller("customer-portal/documents")
@UseGuards(CustomerJwtAuthGuard)
export class CustomerDocumentsController {
  constructor(private readonly svc: CustomerDocumentsService) {}

  @Get()
  list(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.svc.list(customer);
  }
}
