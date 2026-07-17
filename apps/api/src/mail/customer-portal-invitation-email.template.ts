import type { CustomerPortalInvitationEmailMessage } from "./mail.service";
import type { RenderedEmail } from "./invitation-email.template";

/// Minimal HTML entity escaping for the interpolated values — same rule as
/// invitation-email.template.ts: organization/customer/inviter names
/// originate from data staff entered, so they're escaped before landing in
/// the HTML body; the accept URL is escaped too since it sits in an href.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/// Builds the plaintext + HTML bodies for a customer-portal invitation email.
/// Contains the organization name, the optional inviter name, the activation
/// link, and the expiry. Carries no token beyond the already-built accept URL.
export function renderCustomerPortalInvitationEmail(
  message: CustomerPortalInvitationEmailMessage,
): RenderedEmail {
  const { organizationName, customerCompanyName, invitedByName, acceptUrl, expiresAt } = message;

  const intro = invitedByName
    ? `${invitedByName} has invited ${customerCompanyName} to access the ${organizationName} customer portal, where you can track orders, invoices, and deliveries.`
    : `${organizationName} has invited ${customerCompanyName} to access their customer portal, where you can track orders, invoices, and deliveries.`;
  const expiry = expiresAt.toUTCString();

  const subject = `You're invited to the ${organizationName} customer portal`;

  const text = [
    intro,
    "",
    `Activate your account: ${acceptUrl}`,
    "",
    `This invitation expires on ${expiry}.`,
    "If you were not expecting this, you can safely ignore this email.",
  ].join("\n");

  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    `<p><a href="${escapeHtml(acceptUrl)}">Activate your account</a></p>`,
    `<p>This invitation expires on ${escapeHtml(expiry)}.</p>`,
    `<p>If you were not expecting this, you can safely ignore this email.</p>`,
  ].join("\n");

  return { subject, text, html };
}
