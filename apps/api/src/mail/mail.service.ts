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

/// The mail abstraction invitation services depend on. Exactly one concrete
/// implementation is chosen at module load — real SMTP, the dev/test outbox,
/// or a production-safe "unavailable" provider — see `createMailService`.
/// Declared as an abstract class so it doubles as the DI token.
export abstract class MailService {
  abstract sendInvitationEmail(message: InvitationEmailMessage): Promise<void>;
}
