import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  InvitationStatus,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  UserStatus,
  type Invitation,
  type MembershipRole,
} from "@prisma/client";
import type { InvitationConfig } from "../config/configuration";
import { MailService, type InvitationEmailMessage } from "../mail/mail.service";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../prisma/prisma.service";
import { BillingSeatsService } from "../billing/billing-seats.service";
import {
  InvitationAccountUnavailableError,
  InvitationAlreadyAcceptedError,
  InvitationAlreadyExistsError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationOrganizationInactiveError,
  InvitationProcessingConflictError,
  InvitationRevokedError,
  MembershipAlreadyExistsError,
} from "./invitation.errors";
import {
  calculateInvitationExpiry,
  generateInvitationToken,
  hashInvitationToken,
  isInvitationExpired,
} from "./invitation-token.util";

/// Everything createInvitation needs. The organization name and inviter
/// display name are supplied by the caller (a controller, later) rather than
/// looked up here, keeping this service off OrganizationService/UserService.
export interface CreateInvitationInput {
  organizationId: string;
  invitedByUserId: string;
  organizationName: string;
  inviterDisplayName: string | null;
  email: string;
  role: MembershipRole;
}

/// The only shape ever returned to callers. It never carries the raw token,
/// the token hash, or the accept URL.
export interface InvitationSummary {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAt: Date;
  status: InvitationStatus;
}

/// One row of the admin invitation list. Deliberately narrower than the
/// Invitation model: no tokenHash, no acceptedAt/revokedAt, no inviter, no
/// accept URL. The Prisma `select` in listInvitations is what enforces this —
/// the secret columns are never even read out of the database.
export interface InvitationListItem {
  id: string;
  email: string;
  role: MembershipRole;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

/// The safe result of validating an invitation token — everything the accept
/// screen needs to render, and nothing else. Never carries the token, the
/// token hash, or the accept URL.
export interface ValidatedInvitation {
  invitationId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: MembershipRole;
  inviterDisplayName: string | null;
  expiresAt: Date;
}

/// An invitation row joined with just the fields the validation response needs
/// (organization name, inviter name), fetched in a single query.
type InvitationWithRelations = Prisma.InvitationGetPayload<{
  include: {
    organization: { select: { name: true } };
    invitedBy: { select: { firstName: true; lastName: true } };
  };
}>;

/// The minimum an invitee supplies to accept. No internal ids: the invitation
/// is identified by its raw token alone.
export interface AcceptInvitationInput {
  rawToken: string;
  firstName: string;
  lastName: string;
  password: string;
}

/// The safe result of accepting. Never carries a password, password hash,
/// token, or token hash.
export interface AcceptInvitationResult {
  userId: string;
  organizationId: string;
  role: MembershipRole;
}

/// Staff-invitation flow: create/resend/revoke on the admin side, validate/
/// accept on the public side.
///
/// Kept intentionally lean: it injects only Prisma, the mail abstraction,
/// config, and BillingSeatsService — never AuthService/OrganizationsService/
/// etc. — so the invitation surface never becomes a back door into unrelated
/// logic. BillingSeatsService is a peer dependency (not reached through
/// OrganizationsService) because invitations are now the only way an
/// organization gains a member, and seat-limit enforcement has to live
/// wherever that happens.
@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);
  private readonly invitationConfig: InvitationConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly billingSeats: BillingSeatsService,
  ) {
    this.invitationConfig = this.configService.get<InvitationConfig>("invitation")!;
  }

  /// Creates a pending invitation and emails the accept link. The existence
  /// check and the insert run in one transaction; the email is sent only after
  /// that transaction commits — so a failed write never produces an email, and
  /// a failed email never rolls back a committed invitation.
  async createInvitation(input: CreateInvitationInput): Promise<InvitationSummary> {
    // Fails fast, before minting a token or touching the invitation table, so
    // an org at its seat limit gets the same ConflictException addMember used
    // to give rather than a usable invitation nothing can ever accept.
    await this.billingSeats.assertCanAddSeat(input.organizationId);

    const email = input.email.trim().toLowerCase();

    // Generated before the transaction: pure, no I/O. The raw token never
    // leaves this local scope except embedded in the accept URL built below;
    // only its hash is ever persisted.
    const rawToken = this.createToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = this.calculateExpiry();

    const invitation = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findPendingInvitationByEmail(input.organizationId, email, tx);
      if (existing) {
        throw new InvitationAlreadyExistsError();
      }

      try {
        return await tx.invitation.create({
          data: {
            organizationId: input.organizationId,
            email,
            role: input.role,
            tokenHash,
            status: InvitationStatus.PENDING,
            invitedByUserId: input.invitedByUserId,
            expiresAt,
          },
        });
      } catch (error) {
        // The partial unique index backs up the check above under a concurrent
        // race; translate its violation into the same domain error.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new InvitationAlreadyExistsError();
        }
        throw error;
      }
    });

    // After commit only.
    await this.deliverInvitationEmail({
      to: email,
      organizationName: input.organizationName,
      inviterName: input.inviterDisplayName,
      acceptUrl: this.buildAcceptUrl(rawToken),
      expiresAt,
    });

    return this.toSummary(invitation);
  }

  /// Issues a fresh token for an existing active invitation and re-sends the
  /// email. Scoped to `organizationId`: an invitation belonging to another
  /// organization is never found, loaded, or updated. Replacing the stored hash
  /// invalidates the previous link the instant the transaction commits, so an
  /// old copy of the email can no longer be used.
  async resendInvitation(
    organizationId: string,
    invitationId: string,
  ): Promise<InvitationSummary> {
    const rawToken = this.createToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = this.calculateExpiry();

    const invitation = await this.prisma.$transaction(async (tx) => {
      const existing = await this.loadInvitationOrThrow(tx, organizationId, invitationId);
      this.assertInvitationActive(existing);

      // Compare-and-set: only rows that are still open (this org, PENDING, not
      // accepted, not revoked) are updated. A concurrent accept/revoke between
      // the check above and here leaves count at 0, closing the TOCTOU window.
      const result = await tx.invitation.updateMany({
        where: {
          id: invitationId,
          organizationId,
          status: InvitationStatus.PENDING,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { tokenHash, expiresAt },
      });
      if (result.count !== 1) {
        await this.raiseConcurrentModificationError(tx, organizationId, invitationId);
      }

      return { ...existing, tokenHash, expiresAt };
    });

    // After commit only. Org name + inviter display name come from the
    // persisted invitation, read via Prisma — no OrganizationService/UserService
    // dependency.
    const context = await this.loadInvitationEmailContext(invitation);
    await this.deliverInvitationEmail({
      to: invitation.email,
      organizationName: context.organizationName,
      inviterName: context.inviterName,
      acceptUrl: this.buildAcceptUrl(rawToken),
      expiresAt,
    });

    return this.toSummary(invitation);
  }

  /// Revokes an active invitation. Scoped to `organizationId`: another
  /// organization's invitation is never found or revoked. The row is kept
  /// (status REVOKED + revokedAt) rather than deleted, so the accept flow can
  /// tell a revoked link apart from an unknown one. No email is sent.
  async revokeInvitation(
    organizationId: string,
    invitationId: string,
  ): Promise<InvitationSummary> {
    const invitation = await this.prisma.$transaction(async (tx) => {
      const existing = await this.loadInvitationOrThrow(tx, organizationId, invitationId);
      this.assertInvitationActive(existing);

      const revokedAt = new Date();
      // Compare-and-set: see resendInvitation. A concurrent accept/revoke makes
      // this match zero rows instead of blindly overwriting.
      const result = await tx.invitation.updateMany({
        where: {
          id: invitationId,
          organizationId,
          status: InvitationStatus.PENDING,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { status: InvitationStatus.REVOKED, revokedAt },
      });
      if (result.count !== 1) {
        await this.raiseConcurrentModificationError(tx, organizationId, invitationId);
      }

      return { ...existing, status: InvitationStatus.REVOKED, revokedAt };
    });

    return this.toSummary(invitation);
  }

  /// The organization's invitations, newest first, for the admin members
  /// screen. Strictly read-only: one query, no transaction, scoped to
  /// `organizationId` so another tenant's rows can never be reached. The
  /// `select` is the security boundary — tokenHash, acceptedAt, revokedAt and
  /// the inviter are never read from the database at all, so they cannot leak
  /// through this endpoint even by accident.
  listInvitations(organizationId: string): Promise<InvitationListItem[]> {
    return this.prisma.invitation.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /// Validates an invitation token for the accept screen (a later phase).
  /// Strictly read-only: it never changes state. Malformed, unknown, revoked,
  /// accepted, and expired tokens are all rejected — malformed/unknown as a
  /// generic not-found (no enumeration signal), the rest with the precise
  /// domain error via the shared assertion. On success it returns only safe,
  /// display-ready fields.
  async validateInvitationToken(rawToken: string): Promise<ValidatedInvitation> {
    // Reject empty/whitespace-only/malformed before any lookup. A value that is
    // not the shape of a minted token can never match a stored hash, so it is
    // treated as not-found rather than a distinct "malformed" error.
    const token = (typeof rawToken === "string" ? rawToken : "").trim();
    if (!this.isWellFormedToken(token)) {
      throw new InvitationNotFoundError();
    }

    // Look up by hash only — the raw token is never compared or stored. One
    // query with the relations the response needs (no N+1).
    const invitation = await this.findInvitationByTokenHashWithRelations(this.hashToken(token));
    if (!invitation) {
      throw new InvitationNotFoundError();
    }

    // exists / pending / not revoked / not accepted / not expired.
    this.assertInvitationActive(invitation);

    return this.toValidatedInvitation(invitation);
  }

  /// Accepts an invitation: consumes it and provisions the user + membership,
  /// all in one transaction. Concurrency-safe — if two requests submit the same
  /// invitation at once, exactly one succeeds and the other gets the precise
  /// domain error.
  async acceptInvitation(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
    // Step 1: reuse the read-only validator (format/existence/state + identity).
    // Fails fast on an invalid/revoked/accepted/expired token before any write.
    const validated = await this.validateInvitationToken(input.rawToken);

    // Re-check seat capacity at accept time, not just at invite time: the
    // organization may have filled its remaining seats (another accept, a
    // downgrade) in the time between createInvitation and this call. Same
    // pre-check-then-write pattern OrganizationsService.addMember used —
    // not perfectly race-free under two simultaneous accepts for the last
    // seat, but no less safe than that.
    await this.billingSeats.assertCanAddSeat(validated.organizationId);

    // Only pay for argon2 if a password might actually be set: a brand-new user,
    // or an existing one that never set a password. A cheap pre-read decides
    // this; the transaction re-reads for atomicity and hashes in the (near
    // impossible) race where the account changed in between. When an existing
    // active user already has a hash, no argon2 runs at all.
    const preExisting = await this.prisma.user.findUnique({
      where: { email: validated.email },
      select: { passwordHash: true },
    });
    const passwordHash: string | null =
      preExisting === null || preExisting.passwordHash === null
        ? await this.passwordService.hash(input.password)
        : null;

    const result = await this.prisma.$transaction(async (tx) => {
      // Step 2 + Step 5: compare-and-set consume. Claims the invitation
      // atomically — only a row still scoped to this org, PENDING, unaccepted,
      // unrevoked and unexpired is marked ACCEPTED. Doing it first serializes
      // concurrent submissions: the loser matches zero rows and never touches
      // the user or membership tables. The whole transaction rolls back on any
      // later failure, so the invitation is only truly consumed if acceptance
      // fully succeeds. The earlier validate() read is never trusted here.
      const now = new Date();
      const consumed = await tx.invitation.updateMany({
        where: {
          id: validated.invitationId,
          organizationId: validated.organizationId,
          status: InvitationStatus.PENDING,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt: now },
      });
      if (consumed.count !== 1) {
        await this.raiseConcurrentModificationError(
          tx,
          validated.organizationId,
          validated.invitationId,
        );
      }

      // The organization must be active to take on a member (same rule
      // AuthService/JwtStrategy enforce at login).
      await this.assertOrganizationActive(tx, validated.organizationId);

      // Step 3: reuse or create the user, honoring the account lifecycle.
      const userId = await this.resolveUserForAcceptance(tx, validated, input, passwordHash);

      // Step 4: one membership per (organization, user).
      await this.provisionMembership(tx, validated.organizationId, userId, validated.role);

      // Step 6: safe result only.
      return { userId, organizationId: validated.organizationId, role: validated.role };
    });

    // After commit only, mirroring addMember: the membership is real by now,
    // so the subscription's seatsUsed counter should reflect it immediately
    // rather than drift until the next unrelated sync.
    await this.billingSeats.syncSeatsUsed(result.organizationId);

    return result;
  }

  /// A fresh, cryptographically secure raw token. It exists only as a local
  /// value in the caller's scope — never stored, never logged. Only its hash
  /// is persisted; only the accept URL carries the raw value outward.
  private createToken(): string {
    return generateInvitationToken();
  }

  /// SHA-256 hash of a raw token, the only form ever written to the database.
  private hashToken(rawToken: string): string {
    return hashInvitationToken(rawToken);
  }

  /// Expiry for an invitation created now, from the configured lifetime.
  private calculateExpiry(): Date {
    return calculateInvitationExpiry(this.invitationConfig.expiresInDays);
  }

  /// The public accept link a recipient clicks, built from APP_PUBLIC_URL so
  /// the domain is never hardcoded. Any trailing slash on the base is trimmed
  /// so the result is exactly `<APP_PUBLIC_URL>/invite/<token>`.
  private buildAcceptUrl(rawToken: string): string {
    const base = this.invitationConfig.appPublicUrl.replace(/\/+$/, "");
    return `${base}/invite/${rawToken}`;
  }

  /// Read helper: the open (pending, not accepted, not revoked) invitation for
  /// an email within one organization, or null. Email is lowercased to match
  /// the partial unique index (lower(email)). No write occurs.
  private findPendingInvitationByEmail(
    organizationId: string,
    email: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<Invitation | null> {
    return client.invitation.findFirst({
      where: {
        organizationId,
        email: email.toLowerCase(),
        status: InvitationStatus.PENDING,
        acceptedAt: null,
        revokedAt: null,
      },
    });
  }

  /// Read helper: the open invitation matching a token hash, or null. The hash
  /// column is unique, so at most one row matches. No write occurs. The client
  /// defaults to the base connection but accepts a transaction client so the
  /// accept flow (a later phase) can run this inside its own transaction.
  private findPendingInvitationByTokenHash(
    tokenHash: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<Invitation | null> {
    return client.invitation.findFirst({
      where: {
        tokenHash,
        status: InvitationStatus.PENDING,
        acceptedAt: null,
        revokedAt: null,
      },
    });
  }

  /// Whether an invitation's validity window has passed (UTC).
  private isExpired(invitation: Invitation): boolean {
    return isInvitationExpired(invitation.expiresAt);
  }

  /// Throws the specific domain error if the invitation is not usable —
  /// revoked, already accepted, or expired — and returns quietly if it is
  /// still active. Revoked/accepted are checked before expiry so the most
  /// precise reason wins.
  private assertInvitationActive(invitation: Invitation): void {
    if (invitation.revokedAt !== null || invitation.status === InvitationStatus.REVOKED) {
      throw new InvitationRevokedError();
    }
    if (invitation.acceptedAt !== null || invitation.status === InvitationStatus.ACCEPTED) {
      throw new InvitationAlreadyAcceptedError();
    }
    if (this.isExpired(invitation)) {
      throw new InvitationExpiredError();
    }
  }

  /// Loads an invitation by id scoped to its organization, or throws the
  /// generic not-found domain error. Never queries by id alone: an invitation
  /// from another organization returns null here, so it is indistinguishable
  /// from a missing one and can never be acted on. Shared by resend and revoke.
  private async loadInvitationOrThrow(
    client: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<Invitation> {
    const invitation = await client.invitation.findFirst({ where: { id, organizationId } });
    if (!invitation) {
      throw new InvitationNotFoundError();
    }
    return invitation;
  }

  /// Called when a compare-and-set update matched zero rows: the invitation was
  /// mutated (accepted or revoked) by a concurrent request between the check
  /// and the update. Re-reads within the same tenant scope and re-asserts, so
  /// the caller gets the precise current reason rather than a generic clash.
  private async raiseConcurrentModificationError(
    client: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<never> {
    const current = await client.invitation.findFirst({ where: { id, organizationId } });
    if (!current) {
      throw new InvitationNotFoundError();
    }
    this.assertInvitationActive(current);
    // Unreachable in practice: were it still active, the compare-and-set would
    // have matched. Fall back to not-found rather than a silent no-op success.
    throw new InvitationNotFoundError();
  }

  /// Reads the organization name and inviter display name for an invitation's
  /// resend email, via Prisma (not via other services). Missing rows degrade
  /// gracefully so a resend email is still sent.
  private async loadInvitationEmailContext(
    invitation: Invitation,
  ): Promise<{ organizationName: string; inviterName: string | null }> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: invitation.organizationId },
      select: { name: true },
    });

    let inviterName: string | null = null;
    if (invitation.invitedByUserId) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: invitation.invitedByUserId },
        select: { firstName: true, lastName: true },
      });
      if (inviter) {
        inviterName = `${inviter.firstName} ${inviter.lastName}`.trim();
      }
    }

    return { organizationName: organization?.name ?? "", inviterName };
  }

  /// Sends the invitation email after the DB transaction has committed. A
  /// delivery failure is swallowed and logged generically — never with the
  /// email, token, hash, or URL — because the invitation is already valid and
  /// can be resent; rolling it back here would be wrong.
  private async deliverInvitationEmail(message: InvitationEmailMessage): Promise<void> {
    try {
      await this.mailService.sendInvitationEmail(message);
    } catch {
      this.logger.error("Invitation email delivery failed after commit");
    }
  }

  /// Maps a persisted invitation to the safe summary returned to callers.
  private toSummary(invitation: Invitation): InvitationSummary {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
    };
  }

  /// Whether a value has the exact shape of a minted token: 32 random bytes as
  /// base64url, i.e. 43 characters from the URL-safe alphabet, no padding.
  /// Anything else cannot match a stored hash, so it is rejected before any DB
  /// work. This is a format gate, not a secret comparison.
  private isWellFormedToken(token: string): boolean {
    return /^[A-Za-z0-9_-]{43}$/.test(token);
  }

  /// Read helper: the invitation matching a token hash, joined with the
  /// organization name and inviter name the validation response needs — one
  /// query, no writes, no follow-up lookups. `tokenHash` is unique, so at most
  /// one row matches. Unlike findPendingInvitationByTokenHash this does NOT
  /// pre-filter state, so the caller can surface the precise revoked/accepted/
  /// expired reason via assertInvitationActive.
  private findInvitationByTokenHashWithRelations(
    tokenHash: string,
  ): Promise<InvitationWithRelations | null> {
    return this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: {
        organization: { select: { name: true } },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  /// Maps a validated invitation (with relations) to the safe, display-ready
  /// result. Never includes the token, token hash, or accept URL.
  private toValidatedInvitation(invitation: InvitationWithRelations): ValidatedInvitation {
    const inviter = invitation.invitedBy;
    const inviterDisplayName = inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : null;

    return {
      invitationId: invitation.id,
      organizationId: invitation.organizationId,
      organizationName: invitation.organization.name,
      email: invitation.email,
      role: invitation.role,
      inviterDisplayName,
      expiresAt: invitation.expiresAt,
    };
  }

  /// Rejects acceptance into an organization that is not ACTIVE (suspended or
  /// archived) — the same status rule AuthService/JwtStrategy apply. Read fresh
  /// inside the transaction rather than trusting the validate()-time read.
  private async assertOrganizationActive(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<void> {
    const organization = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { status: true },
    });
    if (!organization || organization.status !== OrganizationStatus.ACTIVE) {
      throw new InvitationOrganizationInactiveError();
    }
  }

  /// Resolves the accepting user, honoring the account lifecycle, and returns
  /// their id. Creates a new user when none exists; otherwise reuses the
  /// existing one — but never a soft-deleted or disabled account, and never
  /// overwriting an already-set password. A passwordless/INVITED account is
  /// initialized (password set, activated) as part of accepting.
  private async resolveUserForAcceptance(
    tx: Prisma.TransactionClient,
    validated: ValidatedInvitation,
    input: AcceptInvitationInput,
    precomputedHash: string | null,
  ): Promise<string> {
    const existing = await tx.user.findUnique({ where: { email: validated.email } });

    if (!existing) {
      const passwordHash = precomputedHash ?? (await this.passwordService.hash(input.password));
      const created = await this.createUserForAcceptance(tx, validated.email, input, passwordHash);
      return created.id;
    }

    // Never resurrect a soft-deleted account, and never attach a membership to a
    // disabled one. Reactivation is a deliberate admin action, not an invite
    // side effect. INVITED, by contrast, is a pending state acceptance completes.
    if (existing.deletedAt !== null || existing.status === UserStatus.DISABLED) {
      throw new InvitationAccountUnavailableError();
    }

    const data: Prisma.UserUpdateInput = {};
    // Only set a password when the account has none — never overwrite an
    // existing one.
    if (existing.passwordHash === null) {
      data.passwordHash = precomputedHash ?? (await this.passwordService.hash(input.password));
    }
    // Complete activation of an invited-but-not-yet-active account.
    if (existing.status !== UserStatus.ACTIVE) {
      data.status = UserStatus.ACTIVE;
    }
    if (Object.keys(data).length > 0) {
      await tx.user.update({ where: { id: existing.id }, data });
    }
    return existing.id;
  }

  /// Creates the accepting user, mapping a concurrent unique-email race to a
  /// clean domain error instead of leaking the raw Prisma failure.
  private async createUserForAcceptance(
    tx: Prisma.TransactionClient,
    email: string,
    input: AcceptInvitationInput,
    passwordHash: string,
  ): Promise<{ id: string }> {
    try {
      return await tx.user.create({
        data: {
          email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new InvitationProcessingConflictError();
      }
      throw error;
    }
  }

  /// Creates the membership for an accepted invitation. Any existing membership
  /// — including a soft-REMOVED one — is a conflict: re-enabling a removed
  /// member is a deliberate admin action (OrganizationsService.updateMember),
  /// not a side effect of accepting a fresh invite. The unique index backs up
  /// the pre-check under a concurrent race.
  private async provisionMembership(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    role: MembershipRole,
  ): Promise<void> {
    const existing = await tx.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (existing) {
      throw new MembershipAlreadyExistsError();
    }
    try {
      await tx.membership.create({
        data: { organizationId, userId, role, status: MembershipStatus.ACTIVE },
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new MembershipAlreadyExistsError();
      }
      throw error;
    }
  }

  /// A Prisma unique-constraint violation (P2002), without leaking the error.
  private isUniqueConstraintViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
