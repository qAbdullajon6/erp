import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import { UpdateCustomerProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class CustomerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getProfile(payload: CurrentCustomerPayload) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: payload.customerId },
    });
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
      creditLimit: customer.creditLimit.toString(),
      deliveryNotes: customer.deliveryNotes,
    };
  }

  async updateProfile(payload: CurrentCustomerPayload, dto: UpdateCustomerProfileDto) {
    const customer = await this.prisma.customer.update({
      where: { id: payload.customerId },
      data: {
        ...(dto.contactName !== undefined ? { contactName: dto.contactName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.country !== undefined ? { country: dto.country } : {}),
      },
    });

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
    };
  }
}
