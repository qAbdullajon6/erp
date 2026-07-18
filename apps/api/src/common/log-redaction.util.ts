/// Strips bearer secrets out of a request URL before it is written to any log.
///
/// Redacted secrets:
/// 1. Staff invitation tokens in GET /invite/:token — 256-bit capability
///    that grants access to accept an organization membership.
/// 2. Customer portal invitation tokens in GET /customer-portal/invitations/:token —
///    256-bit capability that grants access to activate a customer portal account.
///
/// POST endpoints (/invite/accept, /customer-portal/invitations/accept) carry
/// tokens in the request body (never logged), so they are preserved intact.
///
/// The negative lookahead excludes the literal `accept` segment; a real 43-char
/// token that starts with "accept" is still redacted.
const INVITATION_TOKEN_IN_PATH = /\/invite\/(?!accept(?:$|\/|\?))[^/?]+/g;
const CUSTOMER_PORTAL_INVITATION_TOKEN_IN_PATH = /\/customer-portal\/invitations\/(?!accept(?:$|\/|\?))[^/?]+/g;

export function redactUrlForLog(url: string): string {
  return url
    .replace(INVITATION_TOKEN_IN_PATH, "/invite/<redacted>")
    .replace(CUSTOMER_PORTAL_INVITATION_TOKEN_IN_PATH, "/customer-portal/invitations/<redacted>");
}
