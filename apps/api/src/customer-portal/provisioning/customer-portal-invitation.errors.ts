import { ConflictException, GoneException, NotFoundException } from "@nestjs/common";

/// Customer-portal-invitation domain errors. Mirrors invitations/invitation.errors.ts:
/// they extend the same HttpException subclasses the rest of the API throws, so the
/// global AllExceptionsFilter serializes them into the standard
/// `{ error: { statusCode, message } }` shape. Every message is deliberately
/// generic: none leaks a database detail, an internal id, or whether a given
/// email/customer is known to the system.

/// The referenced invitation does not exist (or is not visible in this scope).
export class CustomerPortalInvitationNotFoundError extends NotFoundException {
  constructor() {
    super("Invitation not found");
  }
}

/// The invitation exists but its validity window has passed. 410 Gone: the
/// resource was valid once and is no longer.
export class CustomerPortalInvitationExpiredError extends GoneException {
  constructor() {
    super("This invitation has expired");
  }
}

/// The invitation has already been accepted and cannot be used again.
export class CustomerPortalInvitationAlreadyAcceptedError extends GoneException {
  constructor() {
    super("This invitation has already been accepted");
  }
}

/// The invitation was revoked by staff and can no longer be used.
export class CustomerPortalInvitationRevokedError extends GoneException {
  constructor() {
    super("This invitation has been revoked");
  }
}

/// An active (pending, unexpired) invitation for this customer already
/// exists, so a new one must not be created. 409 Conflict.
export class CustomerPortalInvitationAlreadyExistsError extends ConflictException {
  constructor() {
    super("An active portal invitation for this customer already exists");
  }
}

/// The customer already has a portal account, so inviting them again would
/// duplicate it. 409 Conflict.
export class CustomerPortalAccountAlreadyExistsError extends ConflictException {
  constructor() {
    super("This customer already has portal access");
  }
}

/// The organization is not active (suspended or archived) and cannot grant
/// new portal access. 409 Conflict.
export class CustomerPortalOrganizationInactiveError extends ConflictException {
  constructor() {
    super("This organization is not active");
  }
}

/// The customer record is not active (at-risk/inactive/archived) and cannot
/// be granted portal access.
export class CustomerPortalCustomerInactiveError extends ConflictException {
  constructor() {
    super("This customer is not active");
  }
}

/// A concurrent request accepted/revoked the same invitation first, so the
/// write hit a unique constraint or a compare-and-set matched nothing.
/// Surfaced as a clean conflict instead of a raw database error. 409 Conflict.
export class CustomerPortalInvitationProcessingConflictError extends ConflictException {
  constructor() {
    super("The invitation could not be completed due to a concurrent change; please try again");
  }
}
