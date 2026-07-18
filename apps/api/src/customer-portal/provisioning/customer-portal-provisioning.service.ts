import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CustomerPortalAccountStatus,
  CustomerPortalInvitationStatus,
  CustomerStatus,
  OrganizationStatus,
  Prisma,
  type CustomerPortalInvitation,
} from "@prisma/client";
import type { InvitationConfig } from "../../config/configuration";
import { MailService } from "../../mail/mail.service";
import { AuditService } from "../../audit/audit.service";
import { PasswordService } from "../../auth/password.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CustomerPortalAccountAlreadyExistsError,
  CustomerPortalCustomerInactiveError,
  CustomerPortalInvitationAlreadyAcceptedError,
  CustomerPortalInvitationAlreadyExistsError,
  CustomerPortalInvitationExpiredError,
  CustomerPortalInvitationNotFoundError,
  CustomerPortalInvitationProcessingConflictError,
  CustomerPortalInvitationRevokedError,
  CustomerPortalOrganizationInactiveError,
} from "./customer-portal-invitation.errors";
import {
  calculateCustomerPortalInvitationExpiry,
  generateCustomerPortalInvitationToken,
  hashCustomerPortalInvitationToken,
  isCustomerPortalInvitationExpired,
  isWellFormedCustomerPortalInvitationToken,
} from "./customer-portal-invitation-token.util";

/// Everything createInvitation needs. Organization name and inviter display
/// name are supplied by the caller (the controller), keeping this service off
/// OrganizationsService/UsersService — same separation InvitationService uses.
export interface CreateCustomerPortalInvitationInput {
  organizationId: string;
  customerId: string;
  invitedByUserId: string;
  organizationName: string;
  inviterDisplayName: string | null;
}

/// The only shape ever returned to callers. Never carries the raw token, the
/// token hash, or the accept URL.
export interface CustomerPortalInvitationSummary {
  id: string;
  customerId: string;
  email: string;
  status: CustomerPortalInvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

/// The safe result of validating an invitation token — everything the
/// activation screen needs to render, and nothing else.
export interface ValidatedCustomerPortalInvitation {
  invitationId: string;
  organizationId: string;
  organizationName: string;
  customerCompanyName: string;
  email: string;
  expiresAt: Date;
}

type InvitationWithRelations = Prisma.CustomerPortalInvitationGetPayload<{
  include: {
    organization: { select: { name: true } };
    customer: { select: { companyName: true; status: true } };
  };
}>;

/// The minimum an invitee supplies to activate. No internal ids: the
/// invitation is identified by its raw token alone.
export interface AcceptCustomerPortalInvitationInput {
  rawToken: string;
  password: string;
}

/// The safe result of accepting. Never carries a password, password hash,
/// token, or token hash.
export interface AcceptCustomerPortalInvitationResult {
  accountId: string;
  customerId: string;
  organizationId: string;
}

/// The current state of a customer's portal access, for the staff-facing
/// "Portal Access" panel on the customer detail screen.
export interface CustomerPortalAccessStatus {
  hasAccount: boolean;
  accountStatus: CustomerPortalAccountStatus | null;
  email: string | null;
  lastLoginAt: Date | null;
  pendingInvitation: CustomerPortalInvitationSummary | null;
}

/// Customer-portal provisioning: the flow that was entirely missing from the
/// recovered backend (see the repository audit) — invite a customer contact,
/// let them set a password, and manage the resulting account's lifecycle.
/// Deliberately mirrors InvitationService's transactional patterns (token
/// hash + compare-and-set + partial unique index + email-after-commit) so the
/// two invitation flows read the same way to anyone who has worked on one.
@Injectable()
export class CustomerPortalProvisioningService {
  private readonly logger = new Logger(CustomerPortalProvisioningService.name);
  private readonly invitationConfig: InvitationConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly audit: AuditService,
  ) {
    this.invitationConfig = this.configService.get<InvitationConfig>("invitation")!;
  }

  /// Creates a pending invitation and emails the activation link. Refuses a
  /// customer that already has an account, or an inactive customer/org, before
  /// minting a token. The existence check and the insert run in one
  /// transaction; the email is sent only after that transaction commits.
  async createInvitation(
    input: CreateCustomerPortalInvitationInput,
  ): Promise<CustomerPortalInvitationSummary> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, organizationId: input.organizationId },
      select: { email: true, companyName: true, status: true, portalAccount: { select: { id: true } } },
    });
    if (!customer) {
      throw new CustomerPortalInvitationNotFoundError();
    }
    if (customer.portalAccount) {
      throw new CustomerPortalAccountAlreadyExistsError();
    }
    if (customer.status !== CustomerStatus.ACTIVE) {
      throw new CustomerPortalCustomerInactiveError();
    }
    if (!customer.email) {
      throw new CustomerPortalInvitationNotFoundError();
    }
    await this.assertOrganizationActive(this.prisma, input.organizationId);

    const email = customer.email.trim().toLowerCase();
    const rawToken = generateCustomerPortalInvitationToken();
    const tokenHash = hashCustomerPortalInvitationToken(rawToken);
    const expiresAt = calculateCustomerPortalInvitationExpiry(this.invitationConfig.expiresInDays);

    const invitation = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findPendingInvitationByCustomer(tx, input.customerId);
      if (existing) {
        throw new CustomerPortalInvitationAlreadyExistsError();
      }

      try {
        return await tx.customerPortalInvitation.create({
          data: {
            organizationId: input.organizationId,
            customerId: input.customerId,
            email,
            tokenHash,
            status: CustomerPortalInvitationStatus.PENDING,
            invitedByUserId: input.invitedByUserId,
            expiresAt,
          },
        });
      } catch (error) {
        if (this.isUniqueConstraintViolation(error)) {
          throw new CustomerPortalInvitationAlreadyExistsError();
        }
        throw error;
      }
    });

    await this.audit
      .log({
        organizationId: input.organizationId,
        actorUserId: input.invitedByUserId,
        action: "CUSTOMER_PORTAL_INVITATION_CREATED",
        entityType: "CustomerPortalInvitation",
        entityId: invitation.id,
        metadata: { customerId: input.customerId, email },
      })
      .catch(() => undefined);

    // After commit only — a failed write never produces an email.
    await this.deliverInvitationEmail({
      to: email,
      organizationName: input.organizationName,
      customerCompanyName: customer.companyName,
      invitedByName: input.inviterDisplayName,
      acceptUrl: this.buildAcceptUrl(rawToken),
      expiresAt,
    });

    return this.toSummary(invitation);
  }

  /// Issues a fresh token for an existing open invitation and re-sends the
  /// email. Scoped to `organizationId`. Replacing the stored hash invalidates
  /// the previous link the instant the transaction commits.
  async resendInvitation(
    organizationId: string,
    customerId: string,
    invitationId: string,
  ): Promise<CustomerPortalInvitationSummary> {
    const rawToken = generateCustomerPortalInvitationToken();
    const tokenHash = hashCustomerPortalInvitationToken(rawToken);
    const expiresAt = calculateCustomerPortalInvitationExpiry(this.invitationConfig.expiresInDays);

    const invitation = await this.prisma.$transaction(async (tx) => {
      const existing = await this.loadInvitationOrThrow(tx, organizationId, customerId, invitationId);
      this.assertInvitationActive(existing);

      const result = await tx.customerPortalInvitation.updateMany({
        where: {
          id: invitationId,
          organizationId,
          customerId,
          status: CustomerPortalInvitationStatus.PENDING,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { tokenHash, expiresAt },
      });
      if (result.count !== 1) {
        await this.raiseConcurrentModificationError(tx, organizationId, customerId, invitationId);
      }

      return { ...existing, tokenHash, expiresAt };
    });

    const context = await this.loadInvitationEmailContext(invitation);
    await this.deliverInvitationEmail({
      to: invitation.email,
      organizationName: context.organizationName,
      customerCompanyName: context.customerCompanyName,
      invitedByName: null,
      acceptUrl: this.buildAcceptUrl(rawToken),
      expiresAt,
    });

    return this.toSummary(invitation);
  }

  /// Revokes an open invitation. The row is kept (status REVOKED +
  /// revokedAt) rather than deleted, so the accept flow can tell a revoked
  /// link apart from an unknown one. No email is sent.
  async revokeInvitation(
    organizationId: string,
    customerId: string,
    invitationId: string,
    actorUserId: string,
  ): Promise<CustomerPortalInvitationSummary> {
    const invitation = await this.prisma.$transaction(async (tx) => {
      const existing = await this.loadInvitationOrThrow(tx, organizationId, customerId, invitationId);
      this.assertInvitationActive(existing);

      const revokedAt = new Date();
      const result = await tx.customerPortalInvitation.updateMany({
        where: {
          id: invitationId,
          organizationId,
          customerId,
          status: CustomerPortalInvitationStatus.PENDING,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { status: CustomerPortalInvitationStatus.REVOKED, revokedAt },
      });
      if (result.count !== 1) {
        await this.raiseConcurrentModificationError(tx, organizationId, customerId, invitationId);
      }

      return { ...existing, status: CustomerPortalInvitationStatus.REVOKED, revokedAt };
    });

    await this.audit
      .log({
        organizationId,
        actorUserId,
        action: "CUSTOMER_PORTAL_INVITATION_REVOKED",
        entityType: "CustomerPortalInvitation",
        entityId: invitation.id,
        metadata: { customerId },
      })
      .catch(() => undefined);

    return this.toSummary(invitation);
  }

  /// The current portal-access state for one customer: whether they have an
  /// account, its status, and any pending invitation. Powers the staff-facing
  /// "Portal Access" panel.
  async getAccessStatus(organizationId: string, customerId: string): Promise<CustomerPortalAccessStatus> {
    const [account, pending] = await Promise.all([
      this.prisma.customerPortalAccount.findFirst({
        where: { organizationId, customerId },
        select: { status: true, email: true, lastLoginAt: true },
      }),
      this.findPendingInvitationByCustomer(this.prisma, customerId),
    ]);

    return {
      hasAccount: account !== null,
      accountStatus: account?.status ?? null,
      email: account?.email ?? null,
      lastLoginAt: account?.lastLoginAt ?? null,
      pendingInvitation: pending ? this.toSummary(pending) : null,
    };
  }

  /// Suspends an active portal account: existing refresh tokens keep their
  /// rows but `CustomerJwtStrategy` rejects them the instant it re-reads the
  /// account's status, so access stops within one request, not at next login.
  async suspendAccess(organizationId: string, customerId: string, actorUserId: string): Promise<void> {
    const result = await this.prisma.customerPortalAccount.updateMany({
      where: { organizationId, customerId },
      data: { status: CustomerPortalAccountStatus.SUSPENDED },
    });
    if (result.count === 0) {
      throw new CustomerPortalInvitationNotFoundError();
    }
    await this.audit
      .log({
        organizationId,
        actorUserId,
        action: "CUSTOMER_PORTAL_ACCESS_SUSPENDED",
        entityType: "CustomerPortalAccount",
        entityId: customerId,
        metadata: {},
      })
      .catch(() => undefined);
  }

  /// Reactivates a suspended portal account.
  async reactivateAccess(organizationId: string, customerId: string, actorUserId: string): Promise<void> {
    const result = await this.prisma.customerPortalAccount.updateMany({
      where: { organizationId, customerId },
      data: { status: CustomerPortalAccountStatus.ACTIVE },
    });
    if (result.count === 0) {
      throw new CustomerPortalInvitationNotFoundError();
    }
    await this.audit
      .log({
        organizationId,
        actorUserId,
        action: "CUSTOMER_PORTAL_ACCESS_REACTIVATED",
        entityType: "CustomerPortalAccount",
        entityId: customerId,
        metadata: {},
      })
      .catch(() => undefined);
  }

  /// Validates an invitation token for the activation screen. Strictly
  /// read-only. Malformed/unknown tokens are rejected as a generic not-found
  /// (no enumeration signal); revoked/accepted/expired get their precise
  /// domain error.
  async validateInvitationToken(rawToken: string): Promise<ValidatedCustomerPortalInvitation> {
    const token = (typeof rawToken === "string" ? rawToken : "").trim();
    if (!isWellFormedCustomerPortalInvitationToken(token)) {
      throw new CustomerPortalInvitationNotFoundError();
    }

    const invitation = await this.findInvitationByTokenHashWithRelations(
      hashCustomerPortalInvitationToken(token),
    );
    if (!invitation) {
      throw new CustomerPortalInvitationNotFoundError();
    }

    this.assertInvitationActive(invitation);

    return {
      invitationId: invitation.id,
      organizationId: invitation.organizationId,
      organizationName: invitation.organization.name,
      customerCompanyName: invitation.customer.companyName,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
    };
  }

  /// Accepts an invitation: consumes it and creates the CustomerPortalAccount,
  /// all in one transaction. Concurrency-safe — if two requests submit the
  /// same invitation at once, exactly one succeeds.
  async acceptInvitation(
    input: AcceptCustomerPortalInvitationInput,
  ): Promise<AcceptCustomerPortalInvitationResult> {
    const validated = await this.validateInvitationToken(input.rawToken);

    const passwordHash = await this.passwordService.hash(input.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const consumed = await tx.customerPortalInvitation.updateMany({
        where: {
          id: validated.invitationId,
          organizationId: validated.organizationId,
          status: CustomerPortalInvitationStatus.PENDING,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { status: CustomerPortalInvitationStatus.ACCEPTED, acceptedAt: now },
      });
      if (consumed.count !== 1) {
        await this.raiseConcurrentModificationError(
          tx,
          validated.organizationId,
          undefined,
          validated.invitationId,
        );
      }

      await this.assertOrganizationActive(tx, validated.organizationId);

      const invitation = await tx.customerPortalInvitation.findUniqueOrThrow({
        where: { id: validated.invitationId },
      });

      let account;
      try {
        account = await tx.customerPortalAccount.create({
          data: {
            organizationId: validated.organizationId,
            customerId: invitation.customerId,
            email: validated.email,
            passwordHash,
            status: CustomerPortalAccountStatus.ACTIVE,
          },
        });
      } catch (error) {
        if (this.isUniqueConstraintViolation(error)) {
          throw new CustomerPortalAccountAlreadyExistsError();
        }
        throw error;
      }

      return { accountId: account.id, customerId: account.customerId, organizationId: account.organizationId };
    });

    await this.audit
      .log({
        organizationId: result.organizationId,
        actorUserId: null,
        action: "CUSTOMER_PORTAL_INVITATION_ACCEPTED",
        entityType: "CustomerPortalAccount",
        entityId: result.accountId,
        metadata: { customerId: result.customerId },
      })
      .catch(() => undefined);

    return result;
  }

  private buildAcceptUrl(rawToken: string): string {
    const base = this.invitationConfig.appPublicUrl.replace(/\/+$/, "");
    return `${base}/portal/accept-invite?token=${rawToken}`;
  }

  private findPendingInvitationByCustomer(
    client: Prisma.TransactionClient | PrismaService,
    customerId: string,
  ): Promise<CustomerPortalInvitation | null> {
    return client.customerPortalInvitation.findFirst({
      where: {
        customerId,
        status: CustomerPortalInvitationStatus.PENDING,
        acceptedAt: null,
        revokedAt: null,
      },
    });
  }

  private isExpired(invitation: CustomerPortalInvitation): boolean {
    return isCustomerPortalInvitationExpired(invitation.expiresAt);
  }

  private assertInvitationActive(invitation: CustomerPortalInvitation): void {
    if (invitation.revokedAt !== null || invitation.status === CustomerPortalInvitationStatus.REVOKED) {
      throw new CustomerPortalInvitationRevokedError();
    }
    if (invitation.acceptedAt !== null || invitation.status === CustomerPortalInvitationStatus.ACCEPTED) {
      throw new CustomerPortalInvitationAlreadyAcceptedError();
    }
    if (this.isExpired(invitation)) {
      throw new CustomerPortalInvitationExpiredError();
    }
  }

  private async loadInvitationOrThrow(
    client: Prisma.TransactionClient,
    organizationId: string,
    customerId: string,
    id: string,
  ): Promise<CustomerPortalInvitation> {
    const invitation = await client.customerPortalInvitation.findFirst({
      where: { id, organizationId, customerId },
    });
    if (!invitation) {
      throw new CustomerPortalInvitationNotFoundError();
    }
    return invitation;
  }

  private async raiseConcurrentModificationError(
    client: Prisma.TransactionClient,
    organizationId: string,
    customerId: string | undefined,
    id: string,
  ): Promise<never> {
    const current = await client.customerPortalInvitation.findFirst({
      where: { id, organizationId, ...(customerId ? { customerId } : {}) },
    });
    if (!current) {
      throw new CustomerPortalInvitationNotFoundError();
    }
    this.assertInvitationActive(current);
    throw new CustomerPortalInvitationProcessingConflictError();
  }

  private async loadInvitationEmailContext(
    invitation: CustomerPortalInvitation,
  ): Promise<{ organizationName: string; customerCompanyName: string }> {
    const [organization, customer] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: invitation.organizationId }, select: { name: true } }),
      this.prisma.customer.findUnique({ where: { id: invitation.customerId }, select: { companyName: true } }),
    ]);
    return {
      organizationName: organization?.name ?? "",
      customerCompanyName: customer?.companyName ?? "",
    };
  }

  private async deliverInvitationEmail(message: {
    to: string;
    organizationName: string;
    customerCompanyName: string;
    invitedByName: string | null;
    acceptUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    try {
      await this.mailService.sendCustomerPortalInvitationEmail(message);
    } catch {
      this.logger.error("Customer portal invitation email delivery failed after commit");
    }
  }

  private toSummary(invitation: CustomerPortalInvitation): CustomerPortalInvitationSummary {
    return {
      id: invitation.id,
      customerId: invitation.customerId,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  private findInvitationByTokenHashWithRelations(
    tokenHash: string,
  ): Promise<InvitationWithRelations | null> {
    return this.prisma.customerPortalInvitation.findUnique({
      where: { tokenHash },
      include: {
        organization: { select: { name: true } },
        customer: { select: { companyName: true, status: true } },
      },
    });
  }

  private async assertOrganizationActive(
    client: Prisma.TransactionClient | PrismaService,
    organizationId: string,
  ): Promise<void> {
    const organization = await client.organization.findUnique({
      where: { id: organizationId },
      select: { status: true },
    });
    if (!organization || organization.status !== OrganizationStatus.ACTIVE) {
      throw new CustomerPortalOrganizationInactiveError();
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
