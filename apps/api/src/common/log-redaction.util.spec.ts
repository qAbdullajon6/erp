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

  it("redacts ingest ?secret= without leaking the value", () => {
    const secret = "flowtel_live_efC1QGjVo_Hei3UOnvyY--A046M0HxdZ_0HR56Byjoo";
    const url = `/telematics/ingest/456b52ab-a0f1-4549-8528-093bd163cea5?secret=${secret}`;
    const out = redactUrlForLog(url);
    expect(out).toBe(
      "/telematics/ingest/456b52ab-a0f1-4549-8528-093bd163cea5?secret=<redacted>",
    );
    expect(out).not.toContain(secret);
  });

  it("redacts access_token query values", () => {
    const token = "sk.eyJ1IjoiZXhhbXBsZSIsImEiOiJjbSJ9.secret";
    const out = redactUrlForLog(`/tracking/map/directions?access_token=${token}`);
    expect(out).toBe("/tracking/map/directions?access_token=<redacted>");
    expect(out).not.toContain(token);
  });

  it("redacts password-reset tokens from query strings", () => {
    const token = "R".repeat(43);
    const out = redactUrlForLog(`/auth/reset-password?token=${token}`);
    expect(out).toBe("/auth/reset-password?token=<redacted>");
    expect(out).not.toContain(token);
  });

  it("redacts sensitive params while preserving other query parameters", () => {
    const secret = "super-secret-value";
    const out = redactUrlForLog(
      `/telematics/ingest/dev-1?foo=bar&secret=${secret}&limit=10`,
    );
    expect(out).toBe("/telematics/ingest/dev-1?foo=bar&secret=<redacted>&limit=10");
    expect(out).not.toContain(secret);
    expect(out).toContain("foo=bar");
    expect(out).toContain("limit=10");
  });

  it("is idempotent on already-redacted URLs", () => {
    const once = "/ingest?secret=<redacted>&access_token=<redacted>";
    expect(redactUrlForLog(once)).toBe(once);
  });

  it("leaves URLs without sensitive params unchanged", () => {
    const url = "/tracking/live?vehicleIds=a,b&limit=50";
    expect(redactUrlForLog(url)).toBe(url);
  });

  it("redacts case-insensitive sensitive keys", () => {
    expect(redactUrlForLog("/x?Secret=abc&ACCESS_TOKEN=def")).toBe(
      "/x?Secret=<redacted>&ACCESS_TOKEN=<redacted>",
    );
  });

  it("handles malformed query edges without throwing", () => {
    expect(redactUrlForLog("/x?")).toBe("/x?");
    expect(redactUrlForLog("/x?secret=")).toBe("/x?secret=<redacted>");
    expect(redactUrlForLog("/x?secret=&foo")).toBe("/x?secret=<redacted>&foo");
  });
});
