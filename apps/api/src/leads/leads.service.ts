import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { ListLeadsQueryDto } from "./dto/list-leads-query.dto";
import { UpdateLeadStatusDto } from "./dto/update-lead-status.dto";

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Returns only an acknowledgement, never the stored row: the endpoint is
  /// public, and echoing the record back would let anyone confirm what was
  /// persisted (and hand them the lead's id).
  async create(dto: CreateLeadDto) {
    const lead = await this.prisma.lead.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        company: dto.company.trim(),
        phone: dto.phone.trim(),
        message: dto.message?.trim() || null,
        source: dto.source?.trim() || "landing_demo_modal",
      },
      select: { id: true, createdAt: true },
    });

    this.logger.log(`New demo request ${lead.id} from ${dto.company}`);

    return { received: true };
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
