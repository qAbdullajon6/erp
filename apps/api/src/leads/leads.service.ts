import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLeadDto } from "./dto/create-lead.dto";

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
}
