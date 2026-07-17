import { Controller, Get, HttpCode, Post, Body, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CustomerJwtAuthGuard } from "./guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "./decorators/current-customer.decorator";
import type { CurrentCustomerPayload } from "./interfaces/current-customer.interface";
import { CustomerPortalAuthService } from "./customer-portal-auth.service";
import { CustomerPortalChangePasswordDto } from "./dto/change-password.dto";
import { CustomerPortalLoginDto } from "./dto/login.dto";
import { CustomerPortalRefreshDto } from "./dto/refresh.dto";

/// Same limit as the staff AuthController's login throttle: the only
/// unauthenticated, credential-checking route in this controller.
const LOGIN_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

/// HttpCode(200) on every route here matches the staff AuthController's own
/// convention exactly (login/refresh/logout/change-password are all 200, not
/// Nest's POST default of 201 — none of these routes "creates" a resource in
/// the REST sense).
@Controller("customer-portal/auth")
export class CustomerPortalAuthController {
  constructor(private readonly authService: CustomerPortalAuthService) {}

  @Post("login")
  @Throttle(LOGIN_THROTTLE)
  @HttpCode(200)
  login(@Body() dto: CustomerPortalLoginDto) {
    return this.authService.login(dto);
  }

  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() dto: CustomerPortalRefreshDto) {
    return this.authService.refresh(dto);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post("logout")
  @HttpCode(200)
  logout(
    @CurrentCustomer() customer: CurrentCustomerPayload,
    @Body() dto: CustomerPortalRefreshDto,
  ) {
    return this.authService.logout(customer.accountId, dto.refreshToken);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Get("me")
  me(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.authService.getSession(customer);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post("change-password")
  @HttpCode(200)
  changePassword(
    @CurrentCustomer() customer: CurrentCustomerPayload,
    @Body() dto: CustomerPortalChangePasswordDto,
  ) {
    return this.authService.changePassword(customer, dto);
  }
}
