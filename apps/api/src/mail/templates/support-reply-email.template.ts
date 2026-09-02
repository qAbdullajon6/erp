import type { SupportReplyEmailMessage, RenderedEmail } from "../mail.service";
import type { EmailBrandingContext } from "../components/theme";
import { escapeHtml } from "../components/html-utils";
import { EmailLayout } from "../components/email-layout";
import { EmailHeader } from "../components/email-header";
import { EmailFooter } from "../components/email-footer";
import { EmailSection } from "../components/email-section";
import { EmailTitle } from "../components/email-title";
import { EmailText, EmailMutedText } from "../components/email-text";
import { EmailButton } from "../components/email-button";

export function renderSupportReplyEmail(
  message: SupportReplyEmailMessage,
  branding: EmailBrandingContext,
): RenderedEmail {
  const subject = `FlowERP Support replied: ${message.ticketSubject}`;

  const text = [
    `Hi ${message.recipientName},`,
    "",
    "FlowERP Support replied to your ticket.",
    "",
    `Ticket: ${message.ticketSubject}`,
    "",
    `Latest reply:`,
    message.messagePreview,
    "",
    `Status: ${message.ticketStatus}`,
    "",
    `View ticket: ${message.ticketUrl}`,
    "",
    "If you have questions, open the support panel inside FlowERP.",
  ].join("\n");

  const bodyHtml = [
    EmailHeader({ branding }),
    EmailSection({
      children: [
        EmailTitle({ children: "Support replied to your ticket" }),
        EmailText({
          children: `Hi ${escapeHtml(message.recipientName)},`,
        }),
        EmailText({
          children: "FlowERP Support has replied to your support ticket.",
        }),
      ].join(""),
    }),

    // Ticket details card
    EmailSection({
      paddingTop: 8,
      children: `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
          style="border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;
                         text-transform:uppercase;letter-spacing:0.06em;
                         color:#94a3b8;">Ticket</p>
              <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#1e293b;">
                ${escapeHtml(message.ticketSubject)}
              </p>

              <p style="margin:0 0 4px;font-size:11px;font-weight:600;
                         text-transform:uppercase;letter-spacing:0.06em;
                         color:#94a3b8;">Latest reply</p>
              <p style="margin:0 0 16px;font-size:14px;color:#334155;
                         white-space:pre-wrap;line-height:1.6;">
                ${escapeHtml(message.messagePreview)}
              </p>

              <p style="margin:0 0 4px;font-size:11px;font-weight:600;
                         text-transform:uppercase;letter-spacing:0.06em;
                         color:#94a3b8;">Status</p>
              <p style="margin:0;font-size:13px;color:#334155;">
                ${escapeHtml(message.ticketStatus)}
              </p>
            </td>
          </tr>
        </table>
      `,
    }),

    // CTA
    EmailSection({
      paddingTop: 20,
      children: `<div style="text-align:center;">${EmailButton({ label: "View support ticket", url: message.ticketUrl })}</div>`,
    }),

    // Footer note
    EmailSection({
      paddingTop: 12,
      children: EmailMutedText({
        children:
          "You received this email because you have an open support ticket with FlowERP. " +
          "Reply inside the FlowERP app to keep the conversation in one place.",
      }),
    }),

    EmailFooter({ branding }),
  ].join("");

  return {
    subject,
    text,
    html: EmailLayout({
      title: subject,
      previewText: `New reply on "${message.ticketSubject}": ${message.messagePreview.slice(0, 100)}`,
      children: bodyHtml,
    }),
  };
}
