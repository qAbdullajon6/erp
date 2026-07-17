import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ParseUUIDPipe } from "@nestjs/common";
import { CustomerJwtAuthGuard } from "../auth/guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import { CustomerInvoicesService } from "./customer-invoices.service";
import { ListInvoicesQueryDto } from "../../invoices/dto/list-invoices-query.dto";

@Controller("customer-portal/invoices")
@UseGuards(CustomerJwtAuthGuard)
export class CustomerInvoicesController {
  constructor(private readonly svc: CustomerInvoicesService) {}

  @Get()
  list(@CurrentCustomer() customer: CurrentCustomerPayload, @Query() query: ListInvoicesQueryDto) {
    return this.svc.list(customer, query);
  }

  @Get(":id")
  getById(
    @CurrentCustomer() customer: CurrentCustomerPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.svc.getById(customer, id);
  }
}
