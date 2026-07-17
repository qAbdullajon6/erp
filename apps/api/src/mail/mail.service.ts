/// Everything the mail layer needs to deliver one invitation email.
///
/// The accept URL is built in full by the caller (the invitation service, in a
/// later phase). This contract deliberately never sees the raw invitation
/// token on its own — only the already-assembled `acceptUrl` — so no token can
/// ever be logged or leak out of the mail module.
export interface InvitationEmailMessage {
  /// Recipient email address.
  to: string;
  /// The organization the recipient is being invited into.
  organizationName: string;
  /// Display name of the admin who sent the invite, or null when unknown.
  inviterName: string | null;
  /// The public accept link the recipient clicks. Fully built upstream; the
  /// mail layer treats it as opaque and never parses a token out of it.
  acceptUrl: string;
  /// When the invitation stops being valid.
  expiresAt: Date;
}

/// Everything the mail layer needs to deliver one customer-portal invitation
/// email. Same shape/rationale as InvitationEmailMessage — the accept URL is
/// fully assembled upstream, so no token ever passes through this module.
export interface CustomerPortalInvitationEmailMessage {
  /// Recipient email address.
  to: string;
  /// The organization inviting this customer.
  organizationName: string;
  /// The customer's company name, so the email can address them by it.
  customerCompanyName: string;
  /// Display name of the staff member who sent the invite, or null when unknown.
  invitedByName: string | null;
  /// The public activation link the recipient clicks.
  acceptUrl: string;
  /// When the invitation stops being valid.
  expiresAt: Date;
}

export interface RawEmailMessage {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
}

/// The mail abstraction invitation services depend on. Exactly one concrete
/// implementation is chosen at module load — real SMTP, the dev/test outbox,
/// or a production-safe "unavailable" provider — see `createMailService`.
/// Declared as an abstract class so it doubles as the DI token.
export abstract class MailService {
  abstract sendInvitationEmail(message: InvitationEmailMessage): Promise<void>;
  abstract sendCustomerPortalInvitationEmail(
    message: CustomerPortalInvitationEmailMessage,
  ): Promise<void>;
  abstract sendRawEmail(message: RawEmailMessage): Promise<void>;
}
