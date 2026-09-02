import { Injectable } from "@nestjs/common";
import type {
  CustomerPortalInvitationEmailMessage,
  DemoConfirmationEmailMessage,
  InvitationEmailMessage,
  LeadNotificationEmailMessage,
  PasswordResetEmailMessage,
  RawEmailMessage,
  SupportReplyEmailMessage,
} from "./mail.service";

export interface StoredInvitationEmail extends InvitationEmailMessage {
  /// When the outbox captured the message (not a real send timestamp).
  capturedAt: Date;
}

export interface StoredCustomerPortalInvitationEmail extends CustomerPortalInvitationEmailMessage {
  /// When the outbox captured the message (not a real send timestamp).
  capturedAt: Date;
}

export interface StoredPasswordResetEmail extends PasswordResetEmailMessage {
  capturedAt: Date;
}

export interface StoredLeadNotificationEmail extends LeadNotificationEmailMessage {
  /// When the outbox captured the message (not a real send timestamp).
  capturedAt: Date;
}

export interface StoredDemoConfirmationEmail extends DemoConfirmationEmailMessage {
  /// When the outbox captured the message (not a real send timestamp).
  capturedAt: Date;
}

/// In-memory record of invitation emails "sent" in development and tests.
///
/// Injectable so tests can inspect and clear it, but intentionally NOT exported
/// from MailModule and NOT reachable over HTTP — its only consumers are the
/// dev/test provider (OutboxMailService) and tests. It is never selected as the
/// production fallback (see `createMailService`), so captured payloads can
/// never accumulate in a production process.
///
/// Holds two independent queues (staff invitations, customer-portal
/// invitations) rather than two separate injectable classes, so both
/// providers/tests reach one outbox through one DI token.
@Injectable()
export class MailOutbox {
  private readonly messages: StoredInvitationEmail[] = [];
  private readonly customerPortalMessages: StoredCustomerPortalInvitationEmail[] = [];
  private readonly passwordResetMessages: StoredPasswordResetEmail[] = [];

  record(message: InvitationEmailMessage): void {
    this.messages.push({ ...message, capturedAt: new Date() });
  }

  list(): readonly StoredInvitationEmail[] {
    return [...this.messages];
  }

  last(): StoredInvitationEmail | undefined {
    return this.messages[this.messages.length - 1];
  }

  recordCustomerPortalInvitation(message: CustomerPortalInvitationEmailMessage): void {
    this.customerPortalMessages.push({ ...message, capturedAt: new Date() });
  }

  listCustomerPortalInvitations(): readonly StoredCustomerPortalInvitationEmail[] {
    return [...this.customerPortalMessages];
  }

  lastCustomerPortalInvitation(): StoredCustomerPortalInvitationEmail | undefined {
    return this.customerPortalMessages[this.customerPortalMessages.length - 1];
  }

  recordPasswordReset(message: PasswordResetEmailMessage): void {
    this.passwordResetMessages.push({ ...message, capturedAt: new Date() });
  }

  listPasswordResets(): readonly StoredPasswordResetEmail[] {
    return [...this.passwordResetMessages];
  }

  lastPasswordReset(): StoredPasswordResetEmail | undefined {
    return this.passwordResetMessages[this.passwordResetMessages.length - 1];
  }

  private readonly rawMessages: Array<RawEmailMessage & { capturedAt: Date }> = [];

  recordRaw(message: RawEmailMessage): void {
    this.rawMessages.push({ ...message, capturedAt: new Date() });
  }

  listRaw(): readonly (RawEmailMessage & { capturedAt: Date })[] {
    return [...this.rawMessages];
  }

  private readonly leadNotifications: StoredLeadNotificationEmail[] = [];

  recordLeadNotification(message: LeadNotificationEmailMessage): void {
    this.leadNotifications.push({ ...message, capturedAt: new Date() });
  }

  listLeadNotifications(): readonly StoredLeadNotificationEmail[] {
    return [...this.leadNotifications];
  }

  lastLeadNotification(): StoredLeadNotificationEmail | undefined {
    return this.leadNotifications[this.leadNotifications.length - 1];
  }

  private readonly demoConfirmations: StoredDemoConfirmationEmail[] = [];

  recordDemoConfirmation(message: DemoConfirmationEmailMessage): void {
    this.demoConfirmations.push({ ...message, capturedAt: new Date() });
  }

  listDemoConfirmations(): readonly StoredDemoConfirmationEmail[] {
    return [...this.demoConfirmations];
  }

  lastDemoConfirmation(): StoredDemoConfirmationEmail | undefined {
    return this.demoConfirmations[this.demoConfirmations.length - 1];
  }

  private readonly supportReplyEmails: Array<SupportReplyEmailMessage & { capturedAt: Date }> = [];

  recordSupportReply(message: SupportReplyEmailMessage): void {
    this.supportReplyEmails.push({ ...message, capturedAt: new Date() });
  }

  listSupportReplyEmails(): readonly (SupportReplyEmailMessage & { capturedAt: Date })[] {
    return [...this.supportReplyEmails];
  }

  lastSupportReplyEmail(): (SupportReplyEmailMessage & { capturedAt: Date }) | undefined {
    return this.supportReplyEmails[this.supportReplyEmails.length - 1];
  }

  clear(): void {
    this.messages.length = 0;
    this.customerPortalMessages.length = 0;
    this.passwordResetMessages.length = 0;
    this.rawMessages.length = 0;
    this.leadNotifications.length = 0;
    this.demoConfirmations.length = 0;
    this.supportReplyEmails.length = 0;
  }
}
