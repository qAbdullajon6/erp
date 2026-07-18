import { Injectable } from "@nestjs/common";
import type { CustomerPortalInvitationEmailMessage, InvitationEmailMessage, RawEmailMessage } from "./mail.service";

export interface StoredInvitationEmail extends InvitationEmailMessage {
  /// When the outbox captured the message (not a real send timestamp).
  capturedAt: Date;
}

export interface StoredCustomerPortalInvitationEmail extends CustomerPortalInvitationEmailMessage {
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

  private readonly rawMessages: Array<RawEmailMessage & { capturedAt: Date }> = [];

  recordRaw(message: RawEmailMessage): void {
    this.rawMessages.push({ ...message, capturedAt: new Date() });
  }

  listRaw(): readonly (RawEmailMessage & { capturedAt: Date })[] {
    return [...this.rawMessages];
  }

  clear(): void {
    this.messages.length = 0;
    this.customerPortalMessages.length = 0;
    this.rawMessages.length = 0;
  }
}
