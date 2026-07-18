import { Logger } from "@nestjs/common";
import {
  MailService,
  type CustomerPortalInvitationEmailMessage,
  type InvitationEmailMessage,
  type RawEmailMessage,
} from "../mail.service";
import { redactEmail } from "../mail.util";

/// Production fallback used when NODE_ENV === "production" and no SMTP
/// transport is configured. It refuses to pretend an email was delivered: it
/// rejects so the invitation flow surfaces a clear, non-silent failure to the
/// caller instead of leaving a user with no way in.
///
/// It logs only a generic reason and a redacted recipient — never the accept
/// URL, the token, the SMTP URL, or the raw email address.
export class UnavailableMailService extends MailService {
  private readonly logger = new Logger("MailService");

  sendInvitationEmail(message: InvitationEmailMessage): Promise<void> {
    this.logger.error(
      `Invitation email not sent: no mail transport is configured (recipient ${redactEmail(message.to)})`,
    );
    return Promise.reject(new Error("Email delivery is not configured"));
  }

  sendCustomerPortalInvitationEmail(message: CustomerPortalInvitationEmailMessage): Promise<void> {
    this.logger.error(
      `Customer portal invitation email not sent: no mail transport is configured (recipient ${redactEmail(message.to)})`,
    );
    return Promise.reject(new Error("Email delivery is not configured"));
  }

  sendRawEmail(message: RawEmailMessage): Promise<void> {
    this.logger.error(
      `Email not sent: no mail transport is configured (recipient ${redactEmail(message.to)})`,
    );
    return Promise.reject(new Error("Email delivery is not configured"));
  }
}
