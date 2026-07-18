import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ApiKeyGuard } from "../developer/guards/api-key.guard";
import { ApiKeyRateLimitGuard } from "../developer/guards/api-key-rate-limit.guard";
import { RequireApiKeyScopes } from "../developer/decorators/api-key-scopes.decorator";
import { OrdersService } from "../orders/orders.service";
import { CustomersService } from "../customers/customers.service";
import { DriversService } from "../drivers/drivers.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import { ListOrdersQueryDto } from "../orders/dto/list-orders-query.dto";
import { ListCustomersQueryDto } from "../customers/dto/list-customers-query.dto";
import { ListDriversQueryDto } from "../drivers/dto/list-drivers-query.dto";
import { ListVehiclesQueryDto } from "../vehicles/dto/list-vehicles-query.dto";

/// The third-party integration surface — the thing API keys actually
/// authenticate. Everything under /admin is the *management* of integrations;
/// this is the integration itself.
///
/// Versioned in the path (/v1) from the first release, so a breaking change
/// later is a new prefix rather than a silent contract break for every
/// existing integrator.
///
/// The organizationId is taken from the authenticated key (req.apiKey), never
/// from the request: a caller cannot ask for another tenant's data because
/// they have no way to name a tenant at all. Every handler here re-uses the
/// same service the session-authenticated controllers use, so an integrator
/// and the UI can never drift into seeing different data.
///
/// Guard order matters: ApiKeyGuard authenticates and populates req.apiKey,
/// which ApiKeyRateLimitGuard then meters. Reversing them would meter nothing.
@Controller("v1")
@UseGuards(ApiKeyGuard, ApiKeyRateLimitGuard)
export class PublicApiController {
  constructor(
    private readonly orders: OrdersService,
    private readonly customers: CustomersService,
    private readonly drivers: DriversService,
    private readonly vehicles: VehiclesService,
  ) {}

  /// Echoes back what the presented key is and may do. The endpoint an
  /// integrator hits first to confirm their credential works, and the one
  /// that makes a scope misconfiguration self-diagnosable.
  @Get("me")
  me(@Req() request: Request) {
    const key = request.apiKey!;
    return {
      organizationId: key.organizationId,
      keyName: key.name,
      scopes: key.scopes,
      rateLimitPerMinute: key.rateLimitPerMinute,
    };
  }

  @Get("orders")
  @RequireApiKeyScopes("orders:read")
  listOrders(@Req() request: Request, @Query() query: ListOrdersQueryDto) {
    return this.orders.list(request.apiKey!.organizationId, query);
  }

  @Get("orders/:id")
  @RequireApiKeyScopes("orders:read")
  getOrder(@Req() request: Request, @Param("id", ParseUUIDPipe) id: string) {
    return this.orders.getById(request.apiKey!.organizationId, id);
  }

  @Get("customers")
  @RequireApiKeyScopes("customers:read")
  listCustomers(@Req() request: Request, @Query() query: ListCustomersQueryDto) {
    return this.customers.list(request.apiKey!.organizationId, query);
  }

  @Get("customers/:id")
  @RequireApiKeyScopes("customers:read")
  getCustomer(@Req() request: Request, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.getById(request.apiKey!.organizationId, id);
  }

  @Get("drivers")
  @RequireApiKeyScopes("drivers:read")
  listDrivers(@Req() request: Request, @Query() query: ListDriversQueryDto) {
    return this.drivers.list(request.apiKey!.organizationId, query);
  }

  @Get("vehicles")
  @RequireApiKeyScopes("vehicles:read")
  listVehicles(@Req() request: Request, @Query() query: ListVehiclesQueryDto) {
    return this.vehicles.list(request.apiKey!.organizationId, query);
  }
}
