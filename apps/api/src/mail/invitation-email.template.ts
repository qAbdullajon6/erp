import type { InvitationEmailMessage } from "./mail.service";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/// Minimal HTML entity escaping for the interpolated user/organization values.
/// The organization and inviter names originate from user input, so they are
/// escaped before landing in the HTML body; the accept URL is escaped too since
/// it is placed in an href attribute.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/// Builds the plaintext + HTML bodies for an invitation email. Contains the
/// organization name, the optional inviter name, the accept link, and the
/// expiry. Carries no token beyond the already-built accept URL.
export function renderInvitationEmail(message: InvitationEmailMessage): RenderedEmail {
  const { organizationName, inviterName, acceptUrl, expiresAt } = message;

  const intro = inviterName
    ? `${inviterName} has invited you to join ${organizationName} on FlowERP.`
    : `You have been invited to join ${organizationName} on FlowERP.`;
  const expiry = expiresAt.toUTCString();

  const subject = `You're invited to join ${organizationName} on FlowERP`;

  const text = [
    intro,
    "",
    `Accept your invitation: ${acceptUrl}`,
    "",
    `This invitation expires on ${expiry}.`,
    "If you were not expecting this, you can safely ignore this email.",
  ].join("\n");

  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    `<p><a href="${escapeHtml(acceptUrl)}">Accept your invitation</a></p>`,
    `<p>This invitation expires on ${escapeHtml(expiry)}.</p>`,
    `<p>If you were not expecting this, you can safely ignore this email.</p>`,
  ].join("\n");

  return { subject, text, html };
}
