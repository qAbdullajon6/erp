import { ArgumentsHost, Logger, NotFoundException } from "@nestjs/common";
import { AllExceptionsFilter } from "./http-exception.filter";

function hostFor(url: string): ArgumentsHost {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const request = { method: "GET", url };
  return {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
}

describe("AllExceptionsFilter — URL redaction in logs", () => {
  it("redacts the invitation token when logging an unhandled (non-HTTP) exception", () => {
    const token = "A".repeat(43);
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    new AllExceptionsFilter().catch(new Error("db down"), hostFor(`/invite/${token}`));

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain("/invite/<redacted>");
    expect(logged).not.toContain(token);
    errorSpy.mockRestore();
  });

  it("does not log HttpExceptions at all (so domain errors never expose the token)", () => {
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    new AllExceptionsFilter().catch(new NotFoundException("nope"), hostFor(`/invite/${"A".repeat(43)}`));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
