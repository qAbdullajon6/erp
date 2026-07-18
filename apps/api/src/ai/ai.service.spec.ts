import { AiService } from "./ai.service";

describe("AiService", () => {
  describe("isRetryable (via reflection)", () => {
    let service: AiService;

    beforeEach(() => {
      service = Object.create(AiService.prototype);
    });

    const isRetryable = (error?: string) =>
      (service as unknown as { isRetryable: (e?: string) => boolean }).isRetryable(error);

    it("returns true for timeout errors", () => {
      expect(isRetryable("Request timed out after 30000ms")).toBe(true);
      expect(isRetryable("ECONNREFUSED")).toBe(true);
      expect(isRetryable("ECONNRESET")).toBe(true);
    });

    it("returns true for transient server errors", () => {
      expect(isRetryable("503 Service Temporarily Unavailable")).toBe(true);
      expect(isRetryable("429 Too Many Requests")).toBe(true);
    });

    it("returns true for lock/deadlock errors", () => {
      expect(isRetryable("Could not acquire lock on row")).toBe(true);
      expect(isRetryable("Deadlock detected")).toBe(true);
    });

    it("returns false for permanent errors", () => {
      expect(isRetryable("customerId is required and must be a non-empty string")).toBe(false);
      expect(isRetryable("You do not have access to that.")).toBe(false);
      expect(isRetryable('No such tool: "fake_tool"')).toBe(false);
    });

    it("returns false for undefined/empty", () => {
      expect(isRetryable(undefined)).toBe(false);
      expect(isRetryable("")).toBe(false);
    });
  });
});
