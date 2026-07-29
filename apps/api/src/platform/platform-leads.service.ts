import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MembershipRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { generateUniqueSlug, slugify } from "../organizations/slug.util";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PlatformNotificationsService } from "./platform-notifications.service";
import { SubscriptionLifecycleService } from "../billing/subscription-lifecycle.service";
import { SubscriptionPlanService } from "../billing/subscription-plan.service";
import { InvitationService } from "../invitations/invitation.service";
import {
  LeadTimelineService,
  LeadTimelineType,
} from "../leads/lead-timeline.service";
import type { ConvertLeadDto, ConvertPlanChoice } from "./dto/convert-lead.dto";

const DEFAULT_TRIAL_DAYS = 14;

function planSlugForChoice(choice: ConvertPlanChoice): string {
  switch (choice) {
    case "trial":
      return "starter";
    case "starter":
      return "starter";
    case "professional":
      return "professional";
    case "enterprise":
      return "enterprise";
  }
}

function seatsFromPlanFeatures(features: unknown): number | null {
  if (!features || typeof features !== "object") return null;
  const f = features as Record<string, unknown>;
  if (typeof f.maxUsers === "number") return f.maxUsers;
  if (typeof f.users === "number") return f.users;
  return null;
}

@Injectable()
export class PlatformLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: PlatformNotificationsService,
    private readonly subscriptions: SubscriptionLifecycleService,
    private readonly plans: SubscriptionPlanService,
    private readonly invitations: InvitationService,
    private readonly timeline: LeadTimelineService,
  ) {}

  async convert(leadId: string, dto: ConvertLeadDto, actor: CurrentUserPayload) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException("Lead not found");

    if (lead.convertedOrganizationId) {
      throw new ConflictException({
        message: "Lead is already converted",
        organizationId: lead.convertedOrganizationId,
      });
    }
    if (lead.status === "CLOSED" && !lead.convertedOrganizationId) {
      throw new BadRequestException("Lead is closed and cannot be converted");
    }

    const adminEmail = dto.adminEmail.trim().toLowerCase();
    const organizationName = dto.organizationName.trim();
    const timezone = dto.timezone.trim();
    const currency = dto.currency.trim().toUpperCase();
    let slug = slugify(dto.slug.trim());
    if (slug.length < 2) {
      slug = await generateUniqueSlug(this.prisma, organizationName);
    } else {
      const taken = await this.prisma.organization.findUnique({ where: { slug } });
      if (taken) {
        slug = await generateUniqueSlug(this.prisma, slug);
      }
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) {
      const alreadyMember = await this.prisma.membership.findFirst({
        where: { userId: existingUser.id, status: "ACTIVE" },
      });
      // Existing user without conflicting org membership can still be invited;
      // InvitationService handles join. Block only if they're somehow already
      // bound in a way that would confuse handoff — keep soft: allow invite.
      void alreadyMember;
    }

    const planSlug = planSlugForChoice(dto.plan);
    const plan = await this.plans.getPlanBySlug(planSlug);
    const trialDays =
      dto.plan === "trial" ? (dto.trialDays ?? DEFAULT_TRIAL_DAYS) : undefined;
    const seats = seatsFromPlanFeatures(plan.features);

    const actorUser = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { firstName: true, lastName: true },
    });
    const inviterDisplayName = actorUser
      ? `${actorUser.firstName} ${actorUser.lastName}`.trim()
      : null;

    // 1) Organization + onboarding + close lead (no admin user yet — invite).
    const organization = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug,
          timezone,
          defaultCurrency: currency,
        },
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
        data: {
          status: "CLOSED",
          convertedOrganizationId: organization.id,
        },
      });
      return organization;
    });

    // 2) Subscription (required — Overview must never say "No subscription").
    const subscription = await this.subscriptions.createSubscription(organization.id, plan.id, {
      trialDays,
      seats: seats ?? undefined,
      actor,
    });

    // 3) Invitation + email
    const invite = await this.invitations.createInvitationWithDeliveryReport({
      organizationId: organization.id,
      invitedByUserId: actor.userId,
      organizationName: organization.name,
      inviterDisplayName,
      email: adminEmail,
      role: MembershipRole.ADMIN,
    });

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { convertedInvitationId: invite.invitation.id },
    });

    // 4) Timeline
    await this.timeline.append(leadId, {
      type: LeadTimelineType.CONVERTED,
      title: "Converted",
      body: `Organization ${organization.name} created on ${plan.name}.`,
      metadata: {
        organizationId: organization.id,
        plan: dto.plan,
        planSlug: plan.slug,
        trialDays: trialDays ?? null,
        subscriptionId: subscription.id,
      },
      actorUserId: actor.userId,
    });
    await this.timeline.append(leadId, {
      type: LeadTimelineType.INVITATION_SENT,
      title: invite.emailSent ? "Invitation sent" : "Invitation created",
      body: invite.emailSent
        ? `Admin invitation emailed to ${adminEmail}.`
        : `Invitation created for ${adminEmail}, but email could not be sent.`,
      metadata: {
        invitationId: invite.invitation.id,
        emailSent: invite.emailSent,
        adminEmail,
        adminFirstName: dto.adminFirstName.trim(),
        adminLastName: dto.adminLastName.trim(),
      },
      actorUserId: actor.userId,
    });

    // 5) Audit — full convert context
    await this.audit.log({
      organizationId: organization.id,
      actorUserId: actor.userId,
      action: "platform.lead.convert",
      entityType: "Lead",
      entityId: leadId,
      metadata: {
        organizationId: organization.id,
        leadId,
        plan: dto.plan,
        planSlug: plan.slug,
        planId: plan.id,
        trialDays: trialDays ?? null,
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        adminEmail,
        adminFirstName: dto.adminFirstName.trim(),
        adminLastName: dto.adminLastName.trim(),
        invitationId: invite.invitation.id,
        emailSent: invite.emailSent,
        timezone,
        currency,
        slug: organization.slug,
      },
    });

    // 6) Notifications
    await this.notifications.create({
      type: "lead.converted",
      severity: "INFO",
      title: "Lead converted successfully",
      body: `${lead.company} → ${organization.name} (${plan.name}).`,
      entityType: "Organization",
      entityId: organization.id,
      metadata: { leadId, invitationId: invite.invitation.id },
    });
    if (!invite.emailSent) {
      await this.notifications.create({
        type: "lead.convert.email_failed",
        severity: "WARNING",
        title: "Invitation email could not be sent",
        body: `Organization ${organization.name} was created, but the admin invitation to ${adminEmail} was not delivered. Copy the link or resend.`,
        entityType: "Invitation",
        entityId: invite.invitation.id,
        metadata: { leadId, organizationId: organization.id },
      });
    }

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        timezone: organization.timezone,
        defaultCurrency: organization.defaultCurrency,
      },
      subscription: {
        id: subscription.id,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
        seats: subscription.seats,
        plan: { id: plan.id, name: plan.name, slug: plan.slug },
      },
      invitation: {
        id: invite.invitation.id,
        email: invite.invitation.email,
        expiresAt: invite.invitation.expiresAt,
        emailSent: invite.emailSent,
        acceptUrl: invite.emailSent ? null : invite.acceptUrl,
      },
      admin: {
        firstName: dto.adminFirstName.trim(),
        lastName: dto.adminLastName.trim(),
        email: adminEmail,
      },
      planChoice: dto.plan,
      trialDays: trialDays ?? null,
    };
  }

  async resendConvertedInvitation(leadId: string, actor: CurrentUserPayload) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException("Lead not found");
    if (!lead.convertedOrganizationId || !lead.convertedInvitationId) {
      throw new BadRequestException("Lead has no converted invitation to resend");
    }

    const result = await this.invitations.resendInvitation(
      lead.convertedOrganizationId,
      lead.convertedInvitationId,
    );

    await this.timeline.append(leadId, {
      type: LeadTimelineType.INVITATION_SENT,
      title: result.emailSent ? "Invitation resent" : "Invitation resent (email pending)",
      body: result.emailSent
        ? `Invitation re-sent to ${result.email}.`
        : `Invitation token rotated for ${result.email}; email could not be sent.`,
      metadata: { invitationId: result.id, emailSent: result.emailSent },
      actorUserId: actor.userId,
    });

    if (!result.emailSent) {
      await this.notifications.create({
        type: "lead.convert.email_failed",
        severity: "WARNING",
        title: "Invitation email could not be sent",
        body: `Resend for ${result.email} failed. Copy the invitation link instead.`,
        entityType: "Invitation",
        entityId: result.id,
        metadata: { leadId, organizationId: lead.convertedOrganizationId },
      });
    }

    return {
      invitation: {
        id: result.id,
        email: result.email,
        expiresAt: result.expiresAt,
        emailSent: result.emailSent,
        acceptUrl: result.emailSent ? null : result.acceptUrl,
      },
    };
  }
}
