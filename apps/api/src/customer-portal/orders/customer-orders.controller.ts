import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ParseUUIDPipe } from "@nestjs/common";
import { CustomerJwtAuthGuard } from "../auth/guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import { CustomerOrdersService } from "./customer-orders.service";
import { ListOrdersQueryDto } from "../../orders/dto/list-orders-query.dto";

@Controller("customer-portal/orders")
@UseGuards(CustomerJwtAuthGuard)
export class CustomerOrdersController {
  constructor(private readonly svc: CustomerOrdersService) {}

  @Get()
  list(@CurrentCustomer() customer: CurrentCustomerPayload, @Query() query: ListOrdersQueryDto) {
    return this.svc.list(customer, query);
  }

  @Get(":id")
  getById(
    @CurrentCustomer() customer: CurrentCustomerPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.svc.getById(customer, id);
  }

  @Get(":id/timeline")
  getTimeline(
    @CurrentCustomer() customer: CurrentCustomerPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.svc.getTimeline(customer, id);
  }
}
