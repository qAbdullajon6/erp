import { NotFoundException } from "@nestjs/common";
import { renderInvitationEmail } from "../mail/invitation-email.template";
import { MailOutbox } from "../mail/mail.outbox";
import type { InvitationEmailMessage } from "../mail/mail.service";
import type { PrismaService } from "../prisma/prisma.service";
import { TestSupportController } from "./test-support.controller";

type ExpireArgs = { where: { id: string }; data: { expiresAt: Date } };

const MESSAGE: InvitationEmailMessage = {
  to: "invitee@example.com",
  organizationName: "Acme Logistics",
  inviterName: "Alex Admin",
  acceptUrl: "https://app.flowerp.uz/invite/RAW-TOKEN",
  expiresAt: new Date("2026-07-17T00:00:00.000Z"),
};

function build() {
  const outbox = new MailOutbox();
  const updateMany = jest.fn();
  const prisma = { invitation: { updateMany } } as unknown as PrismaService;
  const controller = new TestSupportController(outbox, prisma);
  return { controller, outbox, updateMany };
}

describe("TestSupportController — GET /test/mail/outbox", () => {
  it("is empty before anything is sent", () => {
    const { controller } = build();
    expect(controller.listOutbox()).toEqual([]);
  });

  it("returns each captured invitation as { to, subject, acceptUrl }", () => {
    const { controller, outbox } = build();
    outbox.record(MESSAGE);

    expect(controller.listOutbox()).toEqual([
      {
        to: "invitee@example.com",
        // Rendered with the same template the real provider uses.
        subject: renderInvitationEmail(MESSAGE).subject,
        acceptUrl: "https://app.flowerp.uz/invite/RAW-TOKEN",
      },
    ]);
  });

  it("exposes nothing beyond to/subject/acceptUrl", () => {
    const { controller, outbox } = build();
    outbox.record(MESSAGE);

    const [email] = controller.listOutbox();
    expect(Object.keys(email).sort()).toEqual(["acceptUrl", "subject", "to"]);
  });

  it("returns captured emails oldest first", () => {
    const { controller, outbox } = build();
    outbox.record({ ...MESSAGE, to: "first@example.com" });
    outbox.record({ ...MESSAGE, to: "second@example.com" });

    expect(controller.listOutbox().map((e) => e.to)).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
  });
});

describe("TestSupportController — DELETE /test/mail/outbox", () => {
  it("clears the outbox", () => {
    const { controller, outbox } = build();
    outbox.record(MESSAGE);

    expect(controller.clearOutbox()).toEqual({ cleared: true });
    expect(controller.listOutbox()).toEqual([]);
  });
});

describe("TestSupportController — POST /test/invitations/:id/expire", () => {
  it("backdates expiresAt so the invitation is already expired", async () => {
    const { controller, updateMany } = build();
    let args: ExpireArgs | undefined;
    updateMany.mockImplementation((received: ExpireArgs) => {
      args = received;
      return Promise.resolve({ count: 1 });
    });

    const result = await controller.expireInvitation("inv-1");

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(args?.where).toEqual({ id: "inv-1" });
    expect(args?.data.expiresAt).toBeInstanceOf(Date);
    expect(args?.data.expiresAt.getTime()).toBeLessThan(Date.now());

    expect(result.id).toBe("inv-1");
    expect(result.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it("writes only expiresAt — no other column is touched", async () => {
    const { controller, updateMany } = build();
    let args: ExpireArgs | undefined;
    updateMany.mockImplementation((received: ExpireArgs) => {
      args = received;
      return Promise.resolve({ count: 1 });
    });

    await controller.expireInvitation("inv-1");

    expect(Object.keys(args?.data ?? {})).toEqual(["expiresAt"]);
  });

  it("throws NotFound when no invitation matched", async () => {
    const { controller, updateMany } = build();
    updateMany.mockResolvedValue({ count: 0 });

    await expect(controller.expireInvitation("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
