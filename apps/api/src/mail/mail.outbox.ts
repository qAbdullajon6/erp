import { Injectable } from "@nestjs/common";
import type { InvitationEmailMessage } from "./mail.service";

export interface StoredInvitationEmail extends InvitationEmailMessage {
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
@Injectable()
export class MailOutbox {
  private readonly messages: StoredInvitationEmail[] = [];

  record(message: InvitationEmailMessage): void {
    this.messages.push({ ...message, capturedAt: new Date() });
  }

  list(): readonly StoredInvitationEmail[] {
    return [...this.messages];
  }

  last(): StoredInvitationEmail | undefined {
    return this.messages[this.messages.length - 1];
  }

  clear(): void {
    this.messages.length = 0;
  }
}
