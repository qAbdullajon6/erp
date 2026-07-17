import { Logger } from "@nestjs/common";
import {
  MailService,
  type CustomerPortalInvitationEmailMessage,
  type InvitationEmailMessage,
  type RawEmailMessage,
} from "../mail.service";
import { MailOutbox } from "../mail.outbox";

/// Development/test provider. It captures each invitation in the MailOutbox so
/// tests can assert on it, and logs the full accept URL at debug level for
/// local developer convenience. This provider is only ever selected when
/// NODE_ENV !== "production" (see `createMailService`), so the accept URL can
/// never reach a production log from here.
export class OutboxMailService extends MailService {
  private readonly logger = new Logger("MailService");

  constructor(private readonly outbox: MailOutbox) {
    super();
  }

  sendInvitationEmail(message: InvitationEmailMessage): Promise<void> {
    this.outbox.record(message);
    // Logging the full URL is intentional and safe: this code path runs in
    // development and tests only. Debug level keeps it out of default output.
    this.logger.debug(`Invitation email captured (not sent). Accept URL: ${message.acceptUrl}`);
    return Promise.resolve();
  }

  sendCustomerPortalInvitationEmail(message: CustomerPortalInvitationEmailMessage): Promise<void> {
    this.outbox.recordCustomerPortalInvitation(message);
    this.logger.debug(
      `Customer portal invitation email captured (not sent). Accept URL: ${message.acceptUrl}`,
    );
    return Promise.resolve();
  }

  sendRawEmail(message: RawEmailMessage): Promise<void> {
    this.outbox.recordRaw(message);
    this.logger.debug(`Raw email captured (not sent). To: ${message.to}, Subject: ${message.subject}`);
    return Promise.resolve();
  }
}
