import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CustomerJwtAuthGuard } from "../auth/guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import { CustomerNotificationsService } from "./customer-notifications.service";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";

@Controller("customer-portal/notifications")
@UseGuards(CustomerJwtAuthGuard)
export class CustomerNotificationsController {
  constructor(private readonly svc: CustomerNotificationsService) {}

  @Get()
  list(@CurrentCustomer() customer: CurrentCustomerPayload, @Query("limit") limit?: string) {
    return this.svc.list(customer, { limit: limit ? parseInt(limit, 10) : undefined });
  }

  @Get("unread-count")
  unreadCount(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.svc.unreadCount(customer);
  }

  @Get("preferences")
  getPreferences(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.svc.getPreferences(customer);
  }

  @Patch("preferences")
  updatePreferences(
    @CurrentCustomer() customer: CurrentCustomerPayload,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.svc.updatePreferences(customer, dto);
  }

  @Post(":key/read")
  markRead(@CurrentCustomer() customer: CurrentCustomerPayload, @Param("key") key: string) {
    return this.svc.markRead(customer, key);
  }

  @Post("read-all")
  markAllRead(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.svc.markAllRead(customer);
  }
}
