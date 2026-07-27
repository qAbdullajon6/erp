import { Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import {
  MailService,
  type CustomerPortalInvitationEmailMessage,
  type DemoConfirmationEmailMessage,
  type InvitationEmailMessage,
  type LeadNotificationEmailMessage,
  type RawEmailMessage,
} from "../mail.service";
import { redactEmail, redactEmailList } from "../mail.util";
import type { EmailBrandingContext } from "../components/theme";
import { renderInvitationEmail } from "../templates/invitation-email.template";
import { renderCustomerPortalInvitationEmail } from "../templates/customer-portal-invitation-email.template";
import { renderLeadNotificationEmail } from "../templates/lead-notification-email.template";
import { renderDemoConfirmationEmail } from "../templates/demo-confirmation-email.template";

/// Real SMTP delivery, selected whenever SMTP_URL is configured. Built on
/// nodemailer, the only mail dependency added for this module.
export class SmtpMailService extends MailService {
  private readonly logger = new Logger("MailService");
  private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>;
  private readonly branding: EmailBrandingContext;

  constructor(
    smtpUrl: string,
    private readonly from: string | undefined,
    marketingUrl: string,
  ) {
    super();
    // createTransport parses the URL but does NOT open a connection here — the
    // socket is opened lazily on the first sendMail. So merely selecting this
    // provider (e.g. at module load) sends nothing and touches no network.
    this.transporter = createTransport(smtpUrl);
    this.branding = {
      marketingUrl,
      // The marketing site serves apps/web/public verbatim at its root (see
      // siteConfig.logo on the web side, which resolves the same way) — this
      // is a derived path onto a real, already-deployed asset, not a guess.
      logoUrl: `${marketingUrl}/logo-512.png`,
    };
  }

  /// Every send method funnels its success path through here: one consistent
  /// log line per delivered email, with messageId/accepted/rejected/response
  /// captured (Part 7) and every recipient address redacted (never the raw
  /// address, matching redactEmail's existing use everywhere else in this
  /// module).
  private logDelivered(kind: string, info: SMTPTransport.SentMessageInfo): void {
    this.logger.log(
      `${kind} delivered: messageId=${info.messageId} ` +
        `accepted=[${redactEmailList(info.accepted).join(", ")}] ` +
        `rejected=[${redactEmailList(info.rejected).join(", ")}] ` +
        `response=${info.response}`,
    );
  }

  async sendInvitationEmail(message: InvitationEmailMessage): Promise<void> {
    const { subject, text, html } = renderInvitationEmail(message, this.branding);

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject,
        text,
        html,
      });
      this.logDelivered("Invitation email", info);
    } catch {
      // Deliberately generic: the underlying error can carry the SMTP host and
      // connection detail, so neither it nor the accept URL/recipient address
      // is included. Only a redacted recipient is logged.
      this.logger.error(`Failed to deliver invitation email to ${redactEmail(message.to)}`);
      throw new Error("Failed to deliver invitation email");
    }
  }

  async sendCustomerPortalInvitationEmail(message: CustomerPortalInvitationEmailMessage): Promise<void> {
    const { subject, text, html } = renderCustomerPortalInvitationEmail(message, this.branding);

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject,
        text,
        html,
      });
      this.logDelivered("Customer portal invitation email", info);
    } catch {
      this.logger.error(
        `Failed to deliver customer portal invitation email to ${redactEmail(message.to)}`,
      );
      throw new Error("Failed to deliver customer portal invitation email");
    }
  }

  async sendRawEmail(message: RawEmailMessage): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.textBody,
        html: message.htmlBody,
      });
      this.logDelivered("Email", info);
    } catch {
      this.logger.error(`Failed to deliver email to ${redactEmail(message.to)}`);
      throw new Error("Failed to deliver email");
    }
  }

  async sendLeadNotificationEmail(message: LeadNotificationEmailMessage): Promise<void> {
    const { subject, text, html } = renderLeadNotificationEmail(message, this.branding);

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject,
        text,
        html,
      });
      this.logDelivered("Lead notification email", info);
    } catch {
      this.logger.error(`Failed to deliver lead notification email to ${redactEmail(message.to)}`);
      throw new Error("Failed to deliver lead notification email");
    }
  }

  async sendDemoConfirmationEmail(message: DemoConfirmationEmailMessage): Promise<void> {
    const { subject, text, html } = renderDemoConfirmationEmail(message, this.branding);

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject,
        text,
        html,
      });
      this.logDelivered("Demo confirmation email", info);
    } catch {
      this.logger.error(`Failed to deliver demo confirmation email to ${redactEmail(message.to)}`);
      throw new Error("Failed to deliver demo confirmation email");
    }
  }
}
