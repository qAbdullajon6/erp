/// Strips bearer secrets out of a request URL before it is written to any log.
///
/// The only secret the API carries in a URL *path* is the invitation token in
/// GET /invite/:token — a 256-bit capability. If it reached the logs, a reader
/// could replay it against POST /invite/accept to join the organization, so it
/// must never be logged. POST /invite/accept carries its token in the request
/// body (which is never logged), so `/invite/accept` is deliberately preserved
/// intact. Every other route is returned unchanged, so normal request logging
/// is unaffected.
///
/// The negative lookahead only excludes the literal `accept` segment; a real
/// 43-char token that merely starts with "accept" is still redacted.
const INVITATION_TOKEN_IN_PATH = /\/invite\/(?!accept(?:$|\/|\?))[^/?]+/g;

export function redactUrlForLog(url: string): string {
  return url.replace(INVITATION_TOKEN_IN_PATH, "/invite/<redacted>");
}
