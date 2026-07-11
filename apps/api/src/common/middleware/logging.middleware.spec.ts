import { Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { LoggingMiddleware } from "./logging.middleware";

function run(originalUrl: string, method = "GET") {
  const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  let finish: (() => void) | undefined;
  const req = { method, originalUrl } as Request;
  const res = {
    statusCode: 200,
    on: (event: string, cb: () => void) => {
      if (event === "finish") finish = cb;
    },
  } as unknown as Response;
  const next = jest.fn();

  new LoggingMiddleware().use(req, res, next);
  finish?.(); // simulate the response completing

  const logged = JSON.stringify(logSpy.mock.calls);
  logSpy.mockRestore();
  return { logged, next };
}

describe("LoggingMiddleware", () => {
  it("redacts the invitation token from the logged URL", () => {
    const token = "A".repeat(43);
    const { logged, next } = run(`/invite/${token}`);

    expect(logged).toContain("/invite/<redacted>");
    expect(logged).not.toContain(token);
    expect(next).toHaveBeenCalled();
  });

  it("logs unrelated routes unchanged", () => {
    const { logged } = run("/auth/login", "POST");
    expect(logged).toContain("/auth/login");
  });
});
