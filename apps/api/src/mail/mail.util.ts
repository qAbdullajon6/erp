/// Turns an email address into a coarse identifier safe to put in production
/// logs. It never returns the raw address: "jane.doe@example.com" -> "j***@e***".
/// Enough to correlate a delivery failure with a support request, not enough to
/// recover the address.
export function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return "***";
  const localInitial = email[0];
  const domainInitial = email[at + 1];
  return `${localInitial}***@${domainInitial}***`;
}

/// nodemailer's SentMessageInfo types `accepted`/`rejected` as
/// `Array<string | Address>` (an Address being `{ name, address }`) — this
/// normalizes either shape to the bare address string before redaction.
function addressToString(entry: string | { address: string }): string {
  return typeof entry === "string" ? entry : entry.address;
}

/// redactEmail, applied across a whole accepted/rejected list — what the
/// success-path delivery log (see SmtpMailService) uses so a list of
/// recipients never lands in logs unredacted.
export function redactEmailList(entries: ReadonlyArray<string | { address: string }>): string[] {
  return entries.map((entry) => redactEmail(addressToString(entry)));
}
