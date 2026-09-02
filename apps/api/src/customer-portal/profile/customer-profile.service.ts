import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import { UpdateCustomerProfileDto } from "./dto/update-profile.dto";
import { resolveNotificationPreferences } from "../notifications/notification-preferences";

@Injectable()
export class CustomerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getProfile(payload: CurrentCustomerPayload) {
    const [customer, account] = await Promise.all([
      this.prisma.customer.findUnique({
        // organizationId is redundant given payload.customerId is always
        // DB-verified server-side (never client-supplied), but every
        // sibling service in this module scopes by both — matching that
        // convention here for defense-in-depth.
        where: { id: payload.customerId, organizationId: payload.organizationId },
      }),
      this.prisma.customerPortalAccount.findUnique({
        where: { id: payload.accountId },
        select: {
          notificationPreferences: true,
          language: true,
          timezone: true,
        },
      }),
    ]);
    if (!customer) {
      return null;
    }
    return {
      id: customer.id,
      customerCode: customer.customerCode,
      companyName: customer.companyName,
      contactName: customer.contactName,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      country: customer.country,
      taxId: customer.taxId,
      paymentTerms: customer.paymentTerms,
      // Serialized as a decimal STRING (e.g. "25000.00"), not a JS number, to
      // avoid floating-point precision loss on monetary values — same rule
      // Customer.creditLimit's own schema comment documents, and the same
      // convention every other API in this codebase (Invoice, Order, ...)
      // follows. The originally recovered version used Number(...) here,
      // which this fixes.
      creditLimit: customer.creditLimit != null ? customer.creditLimit.toString() : null,
      deliveryNotes: customer.deliveryNotes,
      language: account?.language ?? "en",
      timezone: account?.timezone ?? "UTC",
      notificationPreferences: resolveNotificationPreferences(account?.notificationPreferences),
    };
  }

  async updateProfile(payload: CurrentCustomerPayload, dto: UpdateCustomerProfileDto) {
    const customer = await this.prisma.customer.update({
      where: { id: payload.customerId, organizationId: payload.organizationId },
      data: {
        ...(dto.contactName !== undefined ? { contactName: dto.contactName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.country !== undefined ? { country: dto.country } : {}),
      },
    });

    let accountPrefs = null as ReturnType<typeof resolveNotificationPreferences> | null;
    let language = "en";
    let timezone = "UTC";

    if (
      dto.language !== undefined ||
      dto.timezone !== undefined ||
      dto.notificationPreferences !== undefined
    ) {
      const current = await this.prisma.customerPortalAccount.findUnique({
        where: { id: payload.accountId },
        select: { notificationPreferences: true, language: true, timezone: true },
      });
      const nextPrefs = {
        ...resolveNotificationPreferences(current?.notificationPreferences),
        ...(dto.notificationPreferences ?? {}),
      };
      const updated = await this.prisma.customerPortalAccount.update({
        where: { id: payload.accountId },
        data: {
          ...(dto.language !== undefined ? { language: dto.language } : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
          ...(dto.notificationPreferences !== undefined
            ? { notificationPreferences: nextPrefs }
            : {}),
        },
        select: { notificationPreferences: true, language: true, timezone: true },
      });
      accountPrefs = resolveNotificationPreferences(updated.notificationPreferences);
      language = updated.language ?? "en";
      timezone = updated.timezone ?? "UTC";
    } else {
      const account = await this.prisma.customerPortalAccount.findUnique({
        where: { id: payload.accountId },
        select: { notificationPreferences: true, language: true, timezone: true },
      });
      accountPrefs = resolveNotificationPreferences(account?.notificationPreferences);
      language = account?.language ?? "en";
      timezone = account?.timezone ?? "UTC";
    }

    await this.audit
      .log({
        organizationId: payload.organizationId,
        actorUserId: null,
        action: "CUSTOMER_PORTAL_PROFILE_UPDATED",
        entityType: "CUSTOMER_PORTAL",
        entityId: payload.customerId,
        metadata: { updatedFields: Object.keys(dto) },
      })
      .catch(() => undefined);

    return {
      contactName: customer.contactName,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      country: customer.country,
      language,
      timezone,
      notificationPreferences: accountPrefs,
    };
  }
}
