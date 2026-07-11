import { ConflictException, GoneException, NotFoundException } from "@nestjs/common";

/// Invitation-specific domain errors. They extend the same HttpException
/// subclasses the rest of the API throws, so the global AllExceptionsFilter
/// serializes them into the standard `{ error: { statusCode, message } }`
/// shape with the right status code. Every message is deliberately generic:
/// none leaks a database detail, an internal id, or whether a given email is
/// known to the system.

/// The referenced invitation does not exist (or is not visible in this scope).
export class InvitationNotFoundError extends NotFoundException {
  constructor() {
    super("Invitation not found");
  }
}

/// The invitation exists but its validity window has passed. 410 Gone: the
/// resource was valid once and is no longer.
export class InvitationExpiredError extends GoneException {
  constructor() {
    super("This invitation has expired");
  }
}

/// The invitation has already been accepted and cannot be used again.
export class InvitationAlreadyAcceptedError extends GoneException {
  constructor() {
    super("This invitation has already been accepted");
  }
}

/// The invitation was revoked by an administrator and can no longer be used.
export class InvitationRevokedError extends GoneException {
  constructor() {
    super("This invitation has been revoked");
  }
}

/// An active (pending, unexpired) invitation for this email already exists in
/// the organization, so a new one must not be created. 409 Conflict.
export class InvitationAlreadyExistsError extends ConflictException {
  constructor() {
    super("An active invitation for this email already exists");
  }
}

/// The invitee is already a member of the organization, so accepting would
/// duplicate the membership. 409 Conflict.
export class MembershipAlreadyExistsError extends ConflictException {
  constructor() {
    super("This account is already a member of the organization");
  }
}

/// The account tied to this invitation's email can no longer be used — it has
/// been soft-deleted or disabled. Acceptance is refused rather than resurrecting
/// or re-enabling it, which is a deliberate admin action, not an invite side
/// effect. Deliberately generic so it does not distinguish deleted vs disabled.
export class InvitationAccountUnavailableError extends ConflictException {
  constructor() {
    super("This account can no longer be used");
  }
}

/// The organization is not active (suspended or archived) and cannot take on
/// new members. 409 Conflict.
export class InvitationOrganizationInactiveError extends ConflictException {
  constructor() {
    super("This organization is not active");
  }
}

/// A concurrent request created the same user or membership first, so the write
/// hit a unique constraint. Surfaced as a clean conflict instead of a raw
/// database error; retrying typically resolves it. 409 Conflict.
export class InvitationProcessingConflictError extends ConflictException {
  constructor() {
    super("The invitation could not be completed due to a concurrent change; please try again");
  }
}
