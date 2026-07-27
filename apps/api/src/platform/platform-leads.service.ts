import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { generateUniqueSlug } from "../organizations/slug.util";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PlatformNotificationsService } from "./platform-notifications.service";
import { PasswordService } from "../auth/password.service";
import { randomBytes } from "crypto";

@Injectable()
export class PlatformLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: PlatformNotificationsService,
    private readonly passwords: PasswordService,
  ) {}

  async convert(leadId: string, actor: CurrentUserPayload) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException("Lead not found");
    if (lead.status === "CLOSED") {
      throw new BadRequestException("Lead is already closed");
    }

    const email = lead.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException("A user with this lead email already exists");
    }

    const slug = await generateUniqueSlug(this.prisma, lead.company);
    const tempPassword = randomBytes(12).toString("base64url");
    const passwordHash = await this.passwords.hash(tempPassword);

    const nameParts = lead.name.trim().split(/\s+/);
    const firstName = nameParts[0] || lead.name;
    const lastName = nameParts.slice(1).join(" ") || "Admin";

    const { organization, user, membership } = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: lead.company.trim(), slug },
      });
      const user = await tx.user.create({
        data: {
          email,
          firstName,
          lastName,
          passwordHash,
          status: "ACTIVE",
        },
      });
      const membership = await tx.membership.create({
        data: { organizationId: organization.id, userId: user.id, role: "ADMIN" },
      });
      await tx.onboardingProgress.create({
        data: {
          organizationId: organization.id,
          completed: false,
          skipped: false,
          steps: {
            organizationProfile: false,
            firstCustomer: false,
            firstDriver: false,
            firstVehicle: false,
            firstOrder: false,
          },
        },
      });
      await tx.lead.update({
        where: { id: leadId },
        data: { status: "CLOSED" },
      });
      return { organization, user, membership };
    });

    await this.audit.log({
      organizationId: organization.id,
      actorUserId: actor.userId,
      action: "platform.lead.convert",
      entityType: "Lead",
      entityId: leadId,
      metadata: { organizationId: organization.id, userId: user.id, membershipId: membership.id },
    });

    await this.notifications.create({
      type: "lead.converted",
      severity: "INFO",
      title: "Lead converted",
      body: `${lead.company} is now organization ${organization.name}.`,
      entityType: "Organization",
      entityId: organization.id,
    });

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      adminUser: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      /// One-time provisional password for handoff — not stored in plaintext elsewhere.
      provisionalPassword: tempPassword,
    };
  }
}
