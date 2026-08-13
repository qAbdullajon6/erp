/// What every render*Email() function in ./templates returns: the three
/// pieces a transport needs to actually send something. `text` is a real,
/// independently-written plaintext version — not an HTML strip — so clients
/// that show it (or spam filters that weigh its absence) get a proper
/// fallback rather than a degraded one.
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

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

export interface PasswordResetEmailMessage {
  to: string;
  firstName: string;
  /// Fully assembled opaque URL. Providers must never log it.
  resetUrl: string;
  expiresAt: Date;
}

export interface RawEmailMessage {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
}

/// Everything the mail layer needs to notify FlowERP staff of one new demo
/// request. Mirrors CreateLeadDto's optional fields — the caller (LeadsService)
/// passes the raw submitted values straight through; formatting/omission of
/// empty fields is the template's job, not the caller's.
export interface LeadNotificationEmailMessage {
  to: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  message?: string;
  source?: string;
  landingPath?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  /// When the lead was actually persisted (Lead.createdAt) — not `new Date()`
  /// at send time, since this fires asynchronously after the row is written.
  submittedAt: Date;
  /// Only set if a lead-dashboard URL is genuinely configured somewhere
  /// upstream. No such config exists in this codebase today, so every
  /// current caller leaves this undefined and the template omits the CTA
  /// button entirely rather than rendering a dead link.
  dashboardUrl?: string;
}

/// Everything the mail layer needs to confirm receipt of one demo request
/// back to the person who submitted it.
export interface DemoConfirmationEmailMessage {
  /// The visitor's own submitted email — this is the one address in this
  /// file that is not staff-controlled, since anyone can type any address
  /// into the public demo form.
  to: string;
  name: string;
  company: string;
  phone: string;
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
  abstract sendPasswordResetEmail(message: PasswordResetEmailMessage): Promise<void>;
  abstract sendRawEmail(message: RawEmailMessage): Promise<void>;
  abstract sendLeadNotificationEmail(message: LeadNotificationEmailMessage): Promise<void>;
  abstract sendDemoConfirmationEmail(message: DemoConfirmationEmailMessage): Promise<void>;
}
