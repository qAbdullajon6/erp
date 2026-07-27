import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PlatformSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string) {
    const query = q.trim();
    if (query.length < 2) {
      return { organizations: [], drivers: [], vehicles: [], leads: [] };
    }

    const plateNormalized = query.replace(/\s+/g, "").toLowerCase();

    const [organizations, drivers, vehicles, leads] = await Promise.all([
      this.prisma.organization.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { slug: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 8,
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true, status: true },
      }),
      this.prisma.driver.findMany({
        where: {
          archivedAt: null,
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 8,
        include: {
          organization: { select: { id: true, name: true, status: true } },
        },
      }),
      this.prisma.vehicle.findMany({
        where: {
          archivedAt: null,
          OR: [
            { plateNumber: { contains: query, mode: "insensitive" } },
            { make: { contains: query, mode: "insensitive" } },
            { model: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 8,
        include: {
          organization: { select: { id: true, name: true, status: true } },
        },
      }),
      this.prisma.lead.findMany({
        where: {
          OR: [
            { company: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 8,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Extra plate match when spaces differ ("90 A 123" vs "90A123").
    const plateExtra =
      plateNormalized.length >= 4
        ? await this.prisma.vehicle.findMany({
            where: { archivedAt: null },
            take: 50,
            include: { organization: { select: { id: true, name: true, status: true } } },
          })
        : [];

    const vehicleIds = new Set(vehicles.map((v) => v.id));
    for (const v of plateExtra) {
      if (v.plateNumber.replace(/\s+/g, "").toLowerCase().includes(plateNormalized) && !vehicleIds.has(v.id)) {
        vehicles.push(v);
        vehicleIds.add(v.id);
      }
    }

    return {
      organizations,
      drivers: drivers.map((d) => ({
        id: d.id,
        name: `${d.firstName} ${d.lastName}`.trim(),
        email: d.email,
        status: d.status,
        organization: d.organization,
      })),
      vehicles: vehicles.slice(0, 8).map((v) => ({
        id: v.id,
        plateNumber: v.plateNumber,
        make: v.make,
        model: v.model,
        status: v.status,
        organization: v.organization,
      })),
      leads: leads.map((l) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        company: l.company,
        status: l.status,
      })),
    };
  }
}
