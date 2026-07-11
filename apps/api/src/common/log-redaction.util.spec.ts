import { redactUrlForLog } from "./log-redaction.util";

describe("redactUrlForLog", () => {
  const TOKEN = "A".repeat(43);

  it("redacts the invitation token from GET /invite/:token", () => {
    const out = redactUrlForLog(`/invite/${TOKEN}`);
    expect(out).toBe("/invite/<redacted>");
    expect(out).not.toContain(TOKEN);
  });

  it("redacts a token even when it starts with the literal 'accept'", () => {
    const token = `accept${"Z".repeat(37)}`; // 43 chars, begins with "accept"
    const out = redactUrlForLog(`/invite/${token}`);
    expect(out).toBe("/invite/<redacted>");
    expect(out).not.toContain(token);
  });

  it("leaves POST /invite/accept intact (its token lives in the body, not the path)", () => {
    expect(redactUrlForLog("/invite/accept")).toBe("/invite/accept");
  });

  it.each([
    "/auth/login",
    "/auth/refresh",
    "/organizations/current/members",
    "/organizations/org-1/invitations",
    "/organizations/org-1/invitations/inv-1/resend",
    "/organizations/org-1/invitations/inv-1/revoke",
    "/health",
    "/health/database",
    "/",
  ])("leaves the unrelated route %s unchanged", (url) => {
    expect(redactUrlForLog(url)).toBe(url);
  });
});
