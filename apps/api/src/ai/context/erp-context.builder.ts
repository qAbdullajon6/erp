import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";

export interface ErpContext {
  organization: { name: string; currency: string; timezone: string };
  user: { name: string; role: string };
  /// Today in the ORGANIZATION's timezone. Without this the model answers
  /// "today" from the server's clock, which for a Tashkent customer on a UTC
  /// host is wrong for five hours a day.
  today: string;
  scale: {
    customers: number;
    activeOrders: number;
    drivers: number;
    vehicles: number;
  };
}

/// Builds the standing facts the model needs on every turn.
///
/// This is deliberately SMALL and deliberately not data. It answers "who am I
/// talking to, at what company, on what date, and roughly how big are they" —
/// the things needed to interpret a question. It does NOT contain customers,
/// orders or invoices: that is what tools are for.
///
/// The distinction matters. Stuffing the org's data into every prompt would be
/// expensive on every turn, stale by construction, capped by the context window,
/// and — worst — it would bypass the tool layer's RBAC, because whatever is in
/// the system prompt has already been shown to the model regardless of what the
/// user may see. Context describes; tools retrieve.
@Injectable()
export class ErpContextBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async build(actor: CurrentUserPayload): Promise<ErpContext> {
    const organizationId = actor.organizationId;

    // Counts, not rows. Five cheap aggregates, one round trip each, and none of
    // them carries a customer's name into the prompt.
    const [organization, user, customers, activeOrders, drivers, vehicles] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { name: true, defaultCurrency: true, timezone: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { firstName: true, lastName: true },
      }),
      this.prisma.customer.count({ where: { organizationId, archivedAt: null } }),
      this.prisma.order.count({
        where: { organizationId, status: { notIn: ["DELIVERED", "CANCELLED"] } },
      }),
      this.prisma.driver.count({ where: { organizationId, archivedAt: null } }),
      this.prisma.vehicle.count({ where: { organizationId, archivedAt: null } }),
    ]);

    return {
      organization: {
        name: organization.name,
        currency: organization.defaultCurrency,
        timezone: organization.timezone,
      },
      user: { name: `${user.firstName} ${user.lastName}`, role: actor.role },
      today: todayIn(organization.timezone),
      scale: { customers, activeOrders, drivers, vehicles },
    };
  }

  /// Rendered as terse prose, not JSON.
  ///
  /// Models follow instructions in prose more reliably than they read a nested
  /// object, and this costs a fraction of the tokens JSON would.
  render(context: ErpContext): string {
    return [
      `## Current context`,
      `Organization: ${context.organization.name}`,
      `Default currency: ${context.organization.currency}`,
      `Timezone: ${context.organization.timezone}`,
      `Today's date: ${context.today}`,
      `You are talking to: ${context.user.name} (role: ${context.user.role})`,
      ``,
      `Scale (for judging whether a number looks plausible, not for answering questions):`,
      `- ${context.scale.customers} customers`,
      `- ${context.scale.activeOrders} orders currently in progress`,
      `- ${context.scale.drivers} drivers, ${context.scale.vehicles} vehicles`,
    ].join("\n");
  }
}

/// Today's date in an IANA timezone, as YYYY-MM-DD.
///
/// `en-CA` because its short date format IS ISO — the alternative is
/// hand-assembling parts from formatToParts, which is more code for the same
/// answer. Falls back to UTC if the organization's timezone is unrecognised,
/// rather than throwing and taking the whole turn down over a config typo.
function todayIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
