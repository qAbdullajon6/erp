import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Post } from "@nestjs/common";
import { renderInvitationEmail } from "../mail/invitation-email.template";
import { renderCustomerPortalInvitationEmail } from "../mail/customer-portal-invitation-email.template";
import { MailOutbox } from "../mail/mail.outbox";
import { PrismaService } from "../prisma/prisma.service";

/// What GET /test/mail/outbox returns: exactly enough for an e2e test to open
/// the invitation link, and nothing more.
export interface OutboxEmail {
  to: string;
  subject: string;
  acceptUrl: string;
}

/// TEST-ONLY HTTP surface. Registered exclusively under NODE_ENV=test (see
/// testSupportImports), so a production build serves none of these routes.
///
/// It exists because the invitation token is, by design, unreachable from an
/// e2e test: only its SHA-256 hash is persisted, and the raw value lives solely
/// inside the emailed accept URL. This exposes the in-memory MailOutbox that the
/// dev/test mail provider already writes to, so the suite can drive the real
/// invite -> email -> accept flow rather than side-loading tokens.
///
/// It holds no business logic: it reads the outbox and backdates one column.
/// Nothing here is reused by, or reachable from, the production code paths.
@Controller("test")
export class TestSupportController {
  constructor(
    private readonly outbox: MailOutbox,
    private readonly prisma: PrismaService,
  ) {}

  /// Invitation emails captured since the last clear, oldest first. The subject
  /// is rendered with the very template the real mail provider uses, so the
  /// suite asserts against the same text a recipient would see.
  @Get("mail/outbox")
  listOutbox(): OutboxEmail[] {
    return this.outbox.list().map((message) => ({
      to: message.to,
      subject: renderInvitationEmail(message).subject,
      acceptUrl: message.acceptUrl,
    }));
  }

  /// Empties the outbox so each test starts from a known state.
  @Delete("mail/outbox")
  @HttpCode(200)
  clearOutbox(): { cleared: true } {
    this.outbox.clear();
    return { cleared: true };
  }

  /// Backdates an invitation's expiry so the suite can exercise the expired
  /// path. `expiresAt` is derived from configuration with a one-day minimum, so
  /// expiry is otherwise unreachable within a test run. Writes exactly one
  /// column and goes nowhere near InvitationService.
  @Post("invitations/:id/expire")
  @HttpCode(200)
  async expireInvitation(@Param("id") id: string): Promise<{ id: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() - 1000);

    const result = await this.prisma.invitation.updateMany({
      where: { id },
      data: { expiresAt },
    });
    if (result.count !== 1) {
      throw new NotFoundException("Invitation not found");
    }

    return { id, expiresAt };
  }

  /// Customer-portal invitation emails captured since the last clear, oldest
  /// first — the same reasoning as listOutbox: the raw activation token is
  /// unreachable from an e2e test by design (only its hash is persisted).
  @Get("mail/customer-portal-outbox")
  listCustomerPortalOutbox(): OutboxEmail[] {
    return this.outbox.listCustomerPortalInvitations().map((message) => ({
      to: message.to,
      subject: renderCustomerPortalInvitationEmail(message).subject,
      acceptUrl: message.acceptUrl,
    }));
  }

  /// Empties the customer-portal outbox queue. Independent of clearOutbox
  /// (MailOutbox.clear() empties both), for a test that only wants to reset one.
  @Delete("mail/customer-portal-outbox")
  @HttpCode(200)
  clearCustomerPortalOutbox(): { cleared: true } {
    this.outbox.clear();
    return { cleared: true };
  }

  @Get("mail/raw-outbox")
  listRawOutbox() {
    return this.outbox.listRaw().map((m) => ({
      to: m.to,
      subject: m.subject,
      textBody: m.textBody,
    }));
  }

  /// Backdates a customer-portal invitation's expiry, mirroring
  /// expireInvitation above.
  @Post("customer-portal-invitations/:id/expire")
  @HttpCode(200)
  async expireCustomerPortalInvitation(
    @Param("id") id: string,
  ): Promise<{ id: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() - 1000);

    const result = await this.prisma.customerPortalInvitation.updateMany({
      where: { id },
      data: { expiresAt },
    });
    if (result.count !== 1) {
      throw new NotFoundException("Invitation not found");
    }

    return { id, expiresAt };
  }
}
