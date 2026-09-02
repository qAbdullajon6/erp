/**
 * SupportRealtimeService unit tests — tenant isolation, fan-out, cleanup.
 */

import type { Response } from "express";
import { SupportRealtimeService, type SupportRealtimeEvent } from "./support-realtime.service";

function makeMockRes(options: { writableEnded?: boolean } = {}): jest.Mocked<Response> {
  return {
    writableEnded: options.writableEnded ?? false,
    write: jest.fn().mockReturnValue(true),
    on: jest.fn(),
  } as unknown as jest.Mocked<Response>;
}

const ORG_A = "org-a";
const ORG_B = "org-b";
const USER_1 = "user-1";
const USER_2 = "user-2";

const SAMPLE_EVENT: SupportRealtimeEvent = {
  type: "support.message.created",
  ticketId: "ticket-1",
  message: {
    id: "msg-1",
    ticketId: "ticket-1",
    isStaff: true,
    body: "We have resolved your issue.",
    createdAt: new Date().toISOString(),
    author: null,
  },
};

describe("SupportRealtimeService", () => {
  let service: SupportRealtimeService;

  beforeEach(() => {
    service = new SupportRealtimeService();
  });

  // ─── Registration ─────────────────────────────────────────────────────────

  it("admits a new client and increments clientCount", () => {
    const res = makeMockRes();
    expect(service.tryRegisterClient(res, { organizationId: ORG_A, userId: USER_1 })).toBe(true);
    expect(service.clientCount()).toBe(1);
    expect(service.orgClientCount(ORG_A)).toBe(1);
    expect(service.orgClientCount(ORG_B)).toBe(0);
  });

  it("removeClient decrements count", () => {
    const res = makeMockRes();
    service.tryRegisterClient(res, { organizationId: ORG_A, userId: USER_1 });
    service.removeClient(res);
    expect(service.clientCount()).toBe(0);
    expect(service.orgClientCount(ORG_A)).toBe(0);
  });

  // ─── Fan-out ──────────────────────────────────────────────────────────────

  it("publish delivers event only to same-org clients", () => {
    const resA = makeMockRes();
    const resB = makeMockRes();
    service.tryRegisterClient(resA, { organizationId: ORG_A, userId: USER_1 });
    service.tryRegisterClient(resB, { organizationId: ORG_B, userId: USER_2 });

    service.publish(ORG_A, SAMPLE_EVENT);

    expect(resA.write).toHaveBeenCalledTimes(1);
    expect(resB.write).toHaveBeenCalledTimes(0); // ← strict isolation
  });

  it("publish delivers to ALL clients of the org (multi-tab)", () => {
    const res1 = makeMockRes();
    const res2 = makeMockRes();
    service.tryRegisterClient(res1, { organizationId: ORG_A, userId: USER_1 });
    service.tryRegisterClient(res2, { organizationId: ORG_A, userId: USER_1 });

    service.publish(ORG_A, SAMPLE_EVENT);

    expect(res1.write).toHaveBeenCalledTimes(1);
    expect(res2.write).toHaveBeenCalledTimes(1);
  });

  it("event payload is valid SSE-formatted JSON", () => {
    const res = makeMockRes();
    service.tryRegisterClient(res, { organizationId: ORG_A, userId: USER_1 });
    service.publish(ORG_A, SAMPLE_EVENT);

    const written = (res.write as jest.Mock).mock.calls[0][0] as string;
    expect(written).toMatch(/^data: /);
    expect(written).toMatch(/\n\n$/);
    const payload = JSON.parse(written.replace(/^data: /, "").trim()) as SupportRealtimeEvent;
    expect(payload.type).toBe("support.message.created");
    expect(payload.ticketId).toBe("ticket-1");
    expect(payload.message.isStaff).toBe(true);
    // Staff author must be null — never expose platform staff identity.
    expect(payload.message.author).toBeNull();
  });

  it("publish with no matching clients is a no-op", () => {
    const res = makeMockRes();
    service.tryRegisterClient(res, { organizationId: ORG_A, userId: USER_1 });
    // Publish to org B — res is org A
    service.publish(ORG_B, SAMPLE_EVENT);
    expect(res.write).not.toHaveBeenCalled();
  });

  // ─── Stale client cleanup ──────────────────────────────────────────────────

  it("publish proactively removes a writableEnded client", () => {
    const res = makeMockRes({ writableEnded: true });
    service.tryRegisterClient(res, { organizationId: ORG_A, userId: USER_1 });
    expect(service.clientCount()).toBe(1);

    service.publish(ORG_A, SAMPLE_EVENT);

    expect(res.write).not.toHaveBeenCalled();
    expect(service.clientCount()).toBe(0);
  });

  it("publish removes a client that throws on write", () => {
    const res = makeMockRes();
    (res.write as jest.Mock).mockImplementation(() => { throw new Error("EPIPE"); });
    service.tryRegisterClient(res, { organizationId: ORG_A, userId: USER_1 });
    expect(service.clientCount()).toBe(1);

    service.publish(ORG_A, SAMPLE_EVENT);

    expect(service.clientCount()).toBe(0);
  });

  it("write failure for one client does not prevent delivery to others", () => {
    const resBroken = makeMockRes();
    const resGood = makeMockRes();
    (resBroken.write as jest.Mock).mockImplementation(() => { throw new Error("EPIPE"); });
    service.tryRegisterClient(resBroken, { organizationId: ORG_A, userId: USER_1 });
    service.tryRegisterClient(resGood, { organizationId: ORG_A, userId: USER_2 });

    service.publish(ORG_A, SAMPLE_EVENT);

    expect(resGood.write).toHaveBeenCalledTimes(1);
    expect(service.clientCount()).toBe(1); // broken one removed
  });

  // ─── Org isolation — stricter assertion ───────────────────────────────────

  it("org B events never reach org A clients, even with many orgs registered", () => {
    const clients: jest.Mocked<Response>[] = [];
    for (let i = 0; i < 5; i++) {
      const r = makeMockRes();
      service.tryRegisterClient(r, { organizationId: ORG_A, userId: `user-a-${i}` });
      clients.push(r);
    }
    const rB = makeMockRes();
    service.tryRegisterClient(rB, { organizationId: ORG_B, userId: USER_2 });

    service.publish(ORG_B, SAMPLE_EVENT);

    clients.forEach((r) => expect(r.write).not.toHaveBeenCalled());
    expect(rB.write).toHaveBeenCalledTimes(1);
  });
});
