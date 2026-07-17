import { Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import {
  MailService,
  type CustomerPortalInvitationEmailMessage,
  type InvitationEmailMessage,
  type RawEmailMessage,
} from "../mail.service";
import { redactEmail } from "../mail.util";
import { renderInvitationEmail } from "../invitation-email.template";
import { renderCustomerPortalInvitationEmail } from "../customer-portal-invitation-email.template";

/// Real SMTP delivery, selected whenever SMTP_URL is configured. Built on
/// nodemailer, the only mail dependency added for this module.
export class SmtpMailService extends MailService {
  private readonly logger = new Logger("MailService");
  private readonly transporter: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string | undefined,
  ) {
    super();
    // createTransport parses the URL but does NOT open a connection here — the
    // socket is opened lazily on the first sendMail. So merely selecting this
    // provider (e.g. at module load) sends nothing and touches no network.
    this.transporter = createTransport(smtpUrl);
  }

  async sendInvitationEmail(message: InvitationEmailMessage): Promise<void> {
    const { subject, text, html } = renderInvitationEmail(message);

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject,
        text,
        html,
      });
    } catch {
      // Deliberately generic: the underlying error can carry the SMTP host and
      // connection detail, so neither it nor the accept URL/recipient address
      // is included. Only a redacted recipient is logged.
      this.logger.error(`Failed to deliver invitation email to ${redactEmail(message.to)}`);
      throw new Error("Failed to deliver invitation email");
    }
  }

  async sendCustomerPortalInvitationEmail(message: CustomerPortalInvitationEmailMessage): Promise<void> {
    const { subject, text, html } = renderCustomerPortalInvitationEmail(message);

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject,
        text,
        html,
      });
    } catch {
      this.logger.error(
        `Failed to deliver customer portal invitation email to ${redactEmail(message.to)}`,
      );
      throw new Error("Failed to deliver customer portal invitation email");
    }
  }

  async sendRawEmail(message: RawEmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.textBody,
        html: message.htmlBody,
      });
    } catch {
      this.logger.error(`Failed to deliver email to ${redactEmail(message.to)}`);
      throw new Error("Failed to deliver email");
    }
  }
}
