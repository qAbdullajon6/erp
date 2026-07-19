import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import type { LeadsConfig } from "../config/configuration";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { ListLeadsQueryDto } from "./dto/list-leads-query.dto";
import { UpdateLeadStatusDto } from "./dto/update-lead-status.dto";

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
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
      select: { id: true, createdAt: true },
    });

    this.logger.log(
      `New demo request ${lead.id} from ${dto.company} (source: ${dto.source ?? "landing_demo_modal"})`,
    );

    // Best-effort notification. A failed/absent mail transport must never fail
    // the visitor's submission — the lead is already safely persisted.
    void this.notifySales(dto);

    return { received: true };
  }

  private async notifySales(dto: CreateLeadDto): Promise<void> {
    const to = this.config.get<LeadsConfig>("leads")?.notifyEmail;
    if (!to) return;

    const attribution = [
      dto.source && `Source: ${dto.source}`,
      dto.utmSource && `utm_source: ${dto.utmSource}`,
      dto.utmMedium && `utm_medium: ${dto.utmMedium}`,
      dto.utmCampaign && `utm_campaign: ${dto.utmCampaign}`,
      dto.referrer && `Referrer: ${dto.referrer}`,
      dto.landingPath && `Landing page: ${dto.landingPath}`,
    ]
      .filter(Boolean)
      .join("\n");

    const textBody = [
      "New demo request from the marketing site.",
      "",
      `Name:    ${dto.name}`,
      `Email:   ${dto.email}`,
      `Company: ${dto.company}`,
      `Phone:   ${dto.phone}`,
      dto.message ? `\nMessage:\n${dto.message}` : "",
      attribution ? `\nAttribution:\n${attribution}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await this.mail.sendRawEmail({
        to,
        subject: `New demo request — ${dto.company}`,
        textBody,
      });
    } catch (error) {
      this.logger.warn(
        `Lead saved but notification email failed: ${error instanceof Error ? error.message : String(error)}`,
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
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }

  async updateStatus(id: string, dto: UpdateLeadStatusDto) {
    await this.getById(id);
    return this.prisma.lead.update({ where: { id }, data: { status: dto.status } });
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
