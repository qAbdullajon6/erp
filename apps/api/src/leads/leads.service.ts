import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import type { LeadsConfig } from "../config/configuration";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { ListLeadsQueryDto } from "./dto/list-leads-query.dto";
import { UpdateLeadStatusDto } from "./dto/update-lead-status.dto";
import { PlatformNotificationsService } from "../platform/platform-notifications.service";
import { LeadTimelineService } from "./lead-timeline.service";

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly platformNotifications: PlatformNotificationsService,
    private readonly timeline: LeadTimelineService,
  ) {}

  /// Returns only an acknowledgement, never the stored row: the endpoint is
  /// public, and echoing the record back would let anyone confirm what was
  /// persisted (and hand them the lead's id).
  async create(dto: CreateLeadDto) {
    const clean = (value?: string) => value?.trim() || null;

    const lead = await this.prisma.lead.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        company: dto.company.trim(),
        phone: dto.phone.trim(),
        message: clean(dto.message),
        source: dto.source?.trim() || "landing_demo_modal",
        utmSource: clean(dto.utmSource),
        utmMedium: clean(dto.utmMedium),
        utmCampaign: clean(dto.utmCampaign),
        utmTerm: clean(dto.utmTerm),
        utmContent: clean(dto.utmContent),
        referrer: clean(dto.referrer),
        landingPath: clean(dto.landingPath),
      },
      select: { id: true, createdAt: true, company: true },
    });

    await this.timeline.appendDemoRequested(lead.id, lead.company);

    this.logger.log(
      `New demo request ${lead.id} from ${dto.company} (source: ${dto.source ?? "landing_demo_modal"})`,
    );

    void this.platformNotifications
      .create({
        type: "lead.new",
        severity: "INFO",
        title: "New Lead",
        body: `${dto.company} — ${dto.name} (${dto.email})`,
        entityType: "Lead",
        entityId: lead.id,
      })
      .catch((error) =>
        this.logger.warn(
          `Lead saved but platform notification failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );

    // Best-effort notifications. A failed/absent mail transport must never
    // fail the visitor's submission — the lead is already safely persisted.
    // The two emails are independent: a failure in one must never affect the
    // other, or the response already sent below.
    void this.notifySales(dto, lead.createdAt);
    void this.notifyCustomer(dto);

    return { received: true };
  }

  /// Emails FlowERP staff (LEADS_NOTIFY_EMAIL) about the new lead. No-op when
  /// unset — leads are still persisted and logged either way.
  private async notifySales(dto: CreateLeadDto, submittedAt: Date): Promise<void> {
    const to = this.config.get<LeadsConfig>("leads")?.notifyEmail;
    if (!to) return;

    try {
      await this.mail.sendLeadNotificationEmail({
        to,
        name: dto.name,
        email: dto.email,
        company: dto.company,
        phone: dto.phone,
        message: dto.message,
        source: dto.source,
        landingPath: dto.landingPath,
        referrer: dto.referrer,
        utmSource: dto.utmSource,
        utmMedium: dto.utmMedium,
        utmCampaign: dto.utmCampaign,
        utmTerm: dto.utmTerm,
        utmContent: dto.utmContent,
        submittedAt,
      });
    } catch (error) {
      this.logger.warn(
        `Lead saved but admin notification email failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /// Confirms receipt to the visitor's own submitted address. Unconditional
  /// (unlike notifySales, there is no config gate) — every successful
  /// submission gets one, since that confirmation is the entire point of
  /// this email.
  private async notifyCustomer(dto: CreateLeadDto): Promise<void> {
    try {
      await this.mail.sendDemoConfirmationEmail({
        to: dto.email,
        name: dto.name,
        company: dto.company,
        phone: dto.phone,
      });
    } catch (error) {
      this.logger.warn(
        `Lead saved but customer confirmation email failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /// Platform-admin only (see PlatformAdminGuard). Leads carry no
  /// organizationId, so there is deliberately no tenant filter here — the
  /// guard, not a where clause, is what keeps customers out of each other's
  /// demo requests.
  async list(query: ListLeadsQueryDto) {
    const where: Prisma.LeadWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { company: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getById(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        timelineEvents: { orderBy: { createdAt: "asc" } },
        convertedOrganization: { select: { id: true, name: true, slug: true, status: true } },
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }

  async updateStatus(id: string, dto: UpdateLeadStatusDto) {
    const existing = await this.getById(id);
    if (existing.convertedOrganizationId && dto.status !== "CLOSED") {
      throw new BadRequestException("Converted leads stay CLOSED");
    }
    const updated = await this.prisma.lead.update({
      where: { id },
      data: { status: dto.status },
    });
    if (existing.status !== dto.status) {
      await this.timeline.appendForStatusChange(id, dto.status);
    }
    return updated;
  }

  /// Powers the pipeline counters above the list, so filtering to one status
  /// does not hide how many leads sit in the other buckets.
  async statusCounts() {
    const grouped = await this.prisma.lead.groupBy({ by: ["status"], _count: { _all: true } });
    return grouped.reduce<Record<string, number>>((counts, row) => {
      counts[row.status] = row._count._all;
      return counts;
    }, {});
  }
}
