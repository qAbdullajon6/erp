import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const LeadTimelineType = {
  DEMO_REQUESTED: "DEMO_REQUESTED",
  SALES_CONTACTED: "SALES_CONTACTED",
  QUALIFIED: "QUALIFIED",
  CONVERTED: "CONVERTED",
  INVITATION_SENT: "INVITATION_SENT",
  INVITATION_ACCEPTED: "INVITATION_ACCEPTED",
  ORGANIZATION_ACTIVATED: "ORGANIZATION_ACTIVATED",
} as const;

export type LeadTimelineTypeValue = (typeof LeadTimelineType)[keyof typeof LeadTimelineType];

const STATUS_EVENT: Partial<
  Record<string, { type: LeadTimelineTypeValue; title: string; body: string }>
> = {
  CONTACTED: {
    type: LeadTimelineType.SALES_CONTACTED,
    title: "Sales contacted",
    body: "Sales reached out to this lead.",
  },
  QUALIFIED: {
    type: LeadTimelineType.QUALIFIED,
    title: "Qualified",
    body: "Lead marked ready for conversion.",
  },
};

@Injectable()
export class LeadTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    leadId: string,
    input: {
      type: LeadTimelineTypeValue;
      title: string;
      body?: string;
      metadata?: Record<string, unknown>;
      actorUserId?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    return db.leadTimelineEvent.create({
      data: {
        leadId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
        actorUserId: input.actorUserId ?? null,
      },
    });
  }

  async appendDemoRequested(leadId: string, company: string, tx?: Prisma.TransactionClient) {
    return this.append(
      leadId,
      {
        type: LeadTimelineType.DEMO_REQUESTED,
        title: "Demo requested",
        body: `${company} submitted a personalized demo request.`,
      },
      tx,
    );
  }

  async appendForStatusChange(
    leadId: string,
    status: string,
    actorUserId?: string,
  ): Promise<void> {
    const mapped = STATUS_EVENT[status];
    if (!mapped) return;
    await this.append(leadId, { ...mapped, actorUserId });
  }

  async listForLead(leadId: string) {
    return this.prisma.leadTimelineEvent.findMany({
      where: { leadId },
      orderBy: { createdAt: "asc" },
    });
  }

  /// When an invitation is accepted, find the lead that converted into that
  /// org (if any) and append accept + activate events.
  async recordInvitationAccepted(organizationId: string, adminEmail: string, userId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { convertedOrganizationId: organizationId },
      select: { id: true },
    });
    if (!lead) return;

    await this.append(lead.id, {
      type: LeadTimelineType.INVITATION_ACCEPTED,
      title: "Invitation accepted",
      body: `${adminEmail} accepted the admin invitation.`,
      metadata: { userId, email: adminEmail },
      actorUserId: userId,
    });
    await this.append(lead.id, {
      type: LeadTimelineType.ORGANIZATION_ACTIVATED,
      title: "Organization activated",
      body: "Organization admin is active and can sign in.",
      metadata: { organizationId },
      actorUserId: userId,
    });
  }
}
