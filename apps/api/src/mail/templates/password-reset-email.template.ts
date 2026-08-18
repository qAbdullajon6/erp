import type { PasswordResetEmailMessage, RenderedEmail } from "../mail.service";
import type { EmailBrandingContext } from "../components/theme";
import { escapeHtml } from "../components/html-utils";
import { EmailLayout } from "../components/email-layout";
import { EmailHeader } from "../components/email-header";
import { EmailFooter } from "../components/email-footer";
import { EmailSection } from "../components/email-section";
import { EmailTitle } from "../components/email-title";
import { EmailText, EmailMutedText } from "../components/email-text";
import { EmailButton } from "../components/email-button";

export function renderPasswordResetEmail(
  message: PasswordResetEmailMessage,
  branding: EmailBrandingContext,
): RenderedEmail {
  const expiry = message.expiresAt.toUTCString();
  const intro = `A password reset was requested for ${message.firstName}'s FlowERP account.`;
  const subject = "Reset your FlowERP password";
  const text = [
    intro,
    "",
    `Reset your password: ${message.resetUrl}`,
    "",
    `This link expires on ${expiry} and can be used only once.`,
    "If you did not request this, you can safely ignore this email.",
  ].join("\n");
  const bodyHtml = [
    EmailHeader({ branding }),
    EmailSection({
      children: [
        EmailTitle({ children: "Reset your password" }),
        EmailText({ children: escapeHtml(intro) }),
      ].join(""),
    }),
    EmailSection({
      paddingTop: 8,
      children: `<div style="text-align:center;">${EmailButton({ label: "Reset password", url: message.resetUrl })}</div>`,
    }),
    EmailSection({
      paddingTop: 8,
      children: [
        EmailMutedText({
          children: `This link expires on ${escapeHtml(expiry)} and can be used only once.`,
        }),
        EmailMutedText({
          children: "If you did not request this, you can safely ignore this email.",
        }),
      ].join(""),
    }),
    EmailFooter({ branding }),
  ].join("");

  return {
    subject,
    text,
    html: EmailLayout({
      title: subject,
      previewText: "Use this secure link to set a new FlowERP password.",
      children: bodyHtml,
    }),
  };
}
