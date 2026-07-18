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
