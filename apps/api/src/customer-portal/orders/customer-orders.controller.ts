import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import { ParseUUIDPipe } from "@nestjs/common";
import type { Response } from "express";
import { CustomerJwtAuthGuard } from "../auth/guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import { CustomerOrdersService } from "./customer-orders.service";
import { ListOrdersQueryDto } from "../../orders/dto/list-orders-query.dto";
import { RawResponse } from "../../common/decorators/raw-response.decorator";

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

  /// Live tracking for one of the customer's own orders.
  @Get(":id/tracking")
  getTracking(
    @CurrentCustomer() customer: CurrentCustomerPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.svc.getTracking(customer, id);
  }

  @Get(":id/delivery-proof")
  getDeliveryProofs(
    @CurrentCustomer() customer: CurrentCustomerPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.svc.getDeliveryProofs(customer, id);
  }

  @RawResponse()
  @Get(":id/delivery-proof/:proofId/file")
  async getDeliveryProofFile(
    @CurrentCustomer() customer: CurrentCustomerPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("proofId", ParseUUIDPipe) proofId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, mimeType, fileName } = await this.svc.getDeliveryProofFile(customer, id, proofId);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${fileName.replace(/"/g, "")}"`);
    return file;
  }
}
