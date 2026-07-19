import { Controller, Get, UseGuards } from "@nestjs/common";
import { CustomerJwtAuthGuard } from "../auth/guards/customer-jwt-auth.guard";
import { CurrentCustomer } from "../auth/decorators/current-customer.decorator";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import { CustomerBillingService } from "./customer-billing.service";

/// Customer Portal billing endpoints - read-only subscription and usage info.
///
/// Customers can view:
/// - GET /customer/billing/subscription - current plan, status, period
/// - GET /customer/billing/usage - usage summary with quotas
/// - GET /customer/billing/invoices - invoice history
/// - GET /customer/billing/payments - payment history
/// - GET /customer/billing/upgrade-eligibility - available upgrade plans
///
/// Write operations (upgrades, cancellations) handled by organization admins.
@Controller("customer/billing")
@UseGuards(CustomerJwtAuthGuard)
export class CustomerBillingController {
  constructor(private readonly billingService: CustomerBillingService) {}

  @Get("subscription")
  async getSubscription(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.billingService.getSubscriptionOverview(customer.organizationId);
  }

  @Get("usage")
  async getUsage(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.billingService.getUsageSummary(customer.organizationId);
  }

  @Get("invoices")
  async getInvoices(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.billingService.getInvoiceHistory(customer.organizationId);
  }

  @Get("payments")
  async getPayments(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.billingService.getPaymentHistory(customer.organizationId);
  }

  @Get("upgrade-eligibility")
  async getUpgradeEligibility(@CurrentCustomer() customer: CurrentCustomerPayload) {
    return this.billingService.getUpgradeEligibility(customer.organizationId);
  }
}
