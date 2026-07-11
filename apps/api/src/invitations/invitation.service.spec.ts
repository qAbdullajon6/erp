import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import {
  InvitationStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  UserStatus,
  type Invitation,
} from "@prisma/client";
import type { InvitationEmailMessage, MailService } from "../mail/mail.service";
import type { PasswordService } from "../auth/password.service";
import type { PrismaService } from "../prisma/prisma.service";
import { InvitationService } from "./invitation.service";
import {
  InvitationAccountUnavailableError,
  InvitationAlreadyAcceptedError,
  InvitationAlreadyExistsError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationOrganizationInactiveError,
  InvitationProcessingConflictError,
  InvitationRevokedError,
  MembershipAlreadyExistsError,
} from "./invitation.errors";
import { hashInvitationToken } from "./invitation-token.util";

/// The service exposes no public API in Task 5.1, so its read-only helpers are
/// reached through a typed view of the instance. This exercises the
/// security-relevant behavior (URL built from config, no hardcoded domain, raw
/// token only in the URL, correct domain errors) without any real DB.
interface InvitationServiceInternals {
  createToken(): string;
  hashToken(rawToken: string): string;
  calculateExpiry(): Date;
  buildAcceptUrl(rawToken: string): string;
  findPendingInvitationByEmail(organizationId: string, email: string): Promise<Invitation | null>;
  findPendingInvitationByTokenHash(tokenHash: string): Promise<Invitation | null>;
  isExpired(invitation: Invitation): boolean;
  assertInvitationActive(invitation: Invitation): void;
}

const INVITATION_CONFIG = {
  appPublicUrl: "https://flowerp.uz",
  expiresInDays: 7,
  smtpUrl: undefined as string | undefined,
  mailFrom: undefined as string | undefined,
};

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  const now = new Date("2026-07-10T00:00:00.000Z");
  return {
    id: "inv-1",
    organizationId: "org-1",
    email: "member@example.com",
    role: MembershipRole.DISPATCHER,
    tokenHash: "hash",
    status: InvitationStatus.PENDING,
    invitedByUserId: null,
    expiresAt: new Date("2026-07-17T00:00:00.000Z"),
    acceptedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildInternals(
  findFirst: jest.Mock,
  configOverrides: Partial<typeof INVITATION_CONFIG> = {},
): InvitationServiceInternals {
  const prisma = { invitation: { findFirst } } as unknown as PrismaService;
  const mail = { sendInvitationEmail: jest.fn() } as unknown as MailService;
  const config = {
    get: jest.fn().mockReturnValue({ ...INVITATION_CONFIG, ...configOverrides }),
  } as unknown as ConfigService;
  const password = { hash: jest.fn(), verify: jest.fn() } as unknown as PasswordService;

  const service = new InvitationService(prisma, mail, config, password);
  return service as unknown as InvitationServiceInternals;
}

describe("InvitationService.buildAcceptUrl", () => {
  it("builds the accept URL from APP_PUBLIC_URL, not a hardcoded domain", () => {
    const internals = buildInternals(jest.fn());
    expect(internals.buildAcceptUrl("RAW-TOKEN")).toBe("https://flowerp.uz/invite/RAW-TOKEN");
  });

  it("trims a trailing slash on the configured base", () => {
    const internals = buildInternals(jest.fn(), { appPublicUrl: "https://flowerp.uz/" });
    expect(internals.buildAcceptUrl("RAW-TOKEN")).toBe("https://flowerp.uz/invite/RAW-TOKEN");
  });

  it("uses whatever origin is configured (proves the domain is not hardcoded)", () => {
    const internals = buildInternals(jest.fn(), { appPublicUrl: "http://localhost:3000" });
    expect(internals.buildAcceptUrl("RAW-TOKEN")).toBe("http://localhost:3000/invite/RAW-TOKEN");
  });
});

describe("InvitationService token + expiry helpers", () => {
  it("createToken yields a 43-char base64url token; hashToken a 64-hex digest", () => {
    const internals = buildInternals(jest.fn());
    const token = internals.createToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(internals.hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(internals.createToken()).not.toBe(token);
  });

  it("calculateExpiry returns a Date ~expiresInDays ahead of now", () => {
    const internals = buildInternals(jest.fn());
    const before = Date.now();
    const expiry = internals.calculateExpiry();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + sevenDays - 1000);
    expect(expiry.getTime()).toBeLessThanOrEqual(Date.now() + sevenDays + 1000);
  });
});

describe("InvitationService read helpers (no writes)", () => {
  it("findPendingInvitationByEmail queries only open rows, with a lowercased email", async () => {
    const row = makeInvitation();
    const findFirst = jest.fn().mockResolvedValue(row);
    const internals = buildInternals(findFirst);

    const result = await internals.findPendingInvitationByEmail("org-1", "Member@Example.com");

    expect(result).toBe(row);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        email: "member@example.com",
        status: InvitationStatus.PENDING,
        acceptedAt: null,
        revokedAt: null,
      },
    });
  });

  it("findPendingInvitationByTokenHash queries by hash among open rows", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const internals = buildInternals(findFirst);

    const result = await internals.findPendingInvitationByTokenHash("abc123");

    expect(result).toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: "abc123",
        status: InvitationStatus.PENDING,
        acceptedAt: null,
        revokedAt: null,
      },
    });
  });
});

describe("InvitationService.isExpired", () => {
  it("delegates to the token util using UTC time", () => {
    const internals = buildInternals(jest.fn());
    expect(internals.isExpired(makeInvitation({ expiresAt: new Date(Date.now() - 1000) }))).toBe(true);
    expect(internals.isExpired(makeInvitation({ expiresAt: new Date(Date.now() + 60_000) }))).toBe(false);
  });
});

describe("InvitationService.assertInvitationActive", () => {
  it("passes for an active, pending, unexpired invitation", () => {
    const internals = buildInternals(jest.fn());
    const active = makeInvitation({ expiresAt: new Date(Date.now() + 60_000) });
    expect(() => internals.assertInvitationActive(active)).not.toThrow();
  });

  it("throws InvitationRevokedError when revoked", () => {
    const internals = buildInternals(jest.fn());
    const revoked = makeInvitation({ revokedAt: new Date(), status: InvitationStatus.REVOKED });
    expect(() => internals.assertInvitationActive(revoked)).toThrow(InvitationRevokedError);
  });

  it("throws InvitationAlreadyAcceptedError when accepted", () => {
    const internals = buildInternals(jest.fn());
    const accepted = makeInvitation({ acceptedAt: new Date(), status: InvitationStatus.ACCEPTED });
    expect(() => internals.assertInvitationActive(accepted)).toThrow(InvitationAlreadyAcceptedError);
  });

  it("throws InvitationExpiredError when past expiry", () => {
    const internals = buildInternals(jest.fn());
    const expired = makeInvitation({ expiresAt: new Date(Date.now() - 1000) });
    expect(() => internals.assertInvitationActive(expired)).toThrow(InvitationExpiredError);
  });
});

// --- Task 5.2: create / resend / revoke ------------------------------------

type CreateArgs = { data: { email: string; tokenHash: string; status: InvitationStatus } };
type UpdateManyArgs = {
  where: {
    id: string;
    organizationId: string;
    status: InvitationStatus;
    acceptedAt: null;
    revokedAt: null;
  };
  data: { tokenHash?: string; expiresAt?: Date; status?: InvitationStatus; revokedAt?: Date };
};

/// A mock Prisma whose $transaction runs its callback with a tx client, so the
/// public create/resend/revoke methods can be driven without a real database.
function buildService(configOverrides: Partial<typeof INVITATION_CONFIG> = {}) {
  const tx = {
    invitation: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    organization: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    membership: { findUnique: jest.fn(), create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
    invitation: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    organization: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const mail = { sendInvitationEmail: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: jest.fn().mockReturnValue({ ...INVITATION_CONFIG, ...configOverrides }),
  };
  const password = { hash: jest.fn().mockResolvedValue("hashed-pw"), verify: jest.fn() };

  const service = new InvitationService(
    prisma as unknown as PrismaService,
    mail,
    config as unknown as ConfigService,
    password,
  );
  return { service, tx, prisma, mail, password };
}

const CREATE_INPUT = {
  organizationId: "org-1",
  invitedByUserId: "user-1",
  organizationName: "Acme Logistics",
  inviterDisplayName: "Alex Admin" as string | null,
  email: "  Member@Example.COM  ",
  role: MembershipRole.DISPATCHER,
};

function rawTokenFrom(url: string | undefined): string {
  return (url ?? "").split("/invite/")[1] ?? "";
}

describe("InvitationService.createInvitation", () => {
  it("normalizes the email, stores only the token hash, and returns a safe summary", async () => {
    const { service, tx, mail } = buildService();
    let createData: CreateArgs["data"] | undefined;
    let sent: InvitationEmailMessage | undefined;
    tx.invitation.findFirst.mockResolvedValue(null);
    tx.invitation.create.mockImplementation((args: CreateArgs) => {
      createData = args.data;
      return Promise.resolve(makeInvitation({ email: args.data.email }));
    });
    mail.sendInvitationEmail.mockImplementation((message: InvitationEmailMessage) => {
      sent = message;
      return Promise.resolve();
    });

    const summary = await service.createInvitation(CREATE_INPUT);

    // Email trimmed + lowercased, both on the write and in the email.
    expect(createData?.email).toBe("member@example.com");
    expect(createData?.status).toBe(InvitationStatus.PENDING);
    expect(sent?.to).toBe("member@example.com");

    // The raw token is only ever in the URL; only its hash is persisted.
    const rawToken = rawTokenFrom(sent?.acceptUrl);
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createData?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken(rawToken)).toBe(createData?.tokenHash);
    expect(createData?.tokenHash).not.toBe(rawToken);

    // The summary never leaks the token, hash, or URL.
    expect(Object.keys(summary).sort()).toEqual(["email", "expiresAt", "id", "role", "status"]);
  });

  it("sends the email only after the transaction commits", async () => {
    const { service, tx, mail } = buildService();
    const order: string[] = [];
    tx.invitation.findFirst.mockResolvedValue(null);
    tx.invitation.create.mockImplementation(() => {
      order.push("create");
      return Promise.resolve(makeInvitation());
    });
    mail.sendInvitationEmail.mockImplementation(() => {
      order.push("mail");
      return Promise.resolve();
    });

    await service.createInvitation(CREATE_INPUT);

    expect(order).toEqual(["create", "mail"]);
  });

  it("throws InvitationAlreadyExistsError and sends no email when an open invite exists", async () => {
    const { service, tx, mail } = buildService();
    tx.invitation.findFirst.mockResolvedValue(makeInvitation());

    await expect(service.createInvitation(CREATE_INPUT)).rejects.toBeInstanceOf(
      InvitationAlreadyExistsError,
    );
    expect(tx.invitation.create).not.toHaveBeenCalled();
    expect(mail.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("maps a P2002 unique-constraint race to InvitationAlreadyExistsError", async () => {
    const { service, tx, mail } = buildService();
    tx.invitation.findFirst.mockResolvedValue(null);
    tx.invitation.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }),
    );

    await expect(service.createInvitation(CREATE_INPUT)).rejects.toBeInstanceOf(
      InvitationAlreadyExistsError,
    );
    expect(mail.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("never sends mail if the DB write failed", async () => {
    const { service, tx, mail } = buildService();
    tx.invitation.findFirst.mockResolvedValue(null);
    tx.invitation.create.mockRejectedValue(new Error("db down"));

    await expect(service.createInvitation(CREATE_INPUT)).rejects.toThrow("db down");
    expect(mail.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("does not roll back or throw when mail fails after commit; logs generically", async () => {
    const { service, tx, mail } = buildService();
    const created = makeInvitation();
    tx.invitation.findFirst.mockResolvedValue(null);
    tx.invitation.create.mockResolvedValue(created);
    mail.sendInvitationEmail.mockRejectedValueOnce(new Error("smtp down"));
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    const summary = await service.createInvitation(CREATE_INPUT);

    expect(summary.id).toBe(created.id);
    expect(errorSpy).toHaveBeenCalledWith("Invitation email delivery failed after commit");
    // The generic message carries no email, token, hash, or URL.
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain("member@example.com");
    expect(logged).not.toContain("/invite/");
    errorSpy.mockRestore();
  });
});

describe("InvitationService.resendInvitation", () => {
  it("loads tenant-scoped, compare-and-sets a new token, and re-sends the email", async () => {
    const { service, tx, prisma, mail } = buildService();
    const existing = makeInvitation({
      tokenHash: "OLD_HASH",
      invitedByUserId: "user-1",
      expiresAt: new Date(Date.now() + 60_000),
    });
    let updateArg: UpdateManyArgs | undefined;
    let sent: InvitationEmailMessage | undefined;
    tx.invitation.findFirst.mockResolvedValue(existing);
    tx.invitation.updateMany.mockImplementation((args: UpdateManyArgs) => {
      updateArg = args;
      return Promise.resolve({ count: 1 });
    });
    prisma.organization.findUnique.mockResolvedValue({ name: "Acme Logistics" });
    prisma.user.findUnique.mockResolvedValue({ firstName: "Alex", lastName: "Admin" });
    mail.sendInvitationEmail.mockImplementation((message: InvitationEmailMessage) => {
      sent = message;
      return Promise.resolve();
    });

    await service.resendInvitation("org-1", "inv-1");

    // The load is scoped by organization, never by id alone.
    expect(tx.invitation.findFirst).toHaveBeenCalledWith({
      where: { id: "inv-1", organizationId: "org-1" },
    });
    // The write is a compare-and-set on the open-invitation predicate.
    expect(updateArg?.where).toEqual({
      id: "inv-1",
      organizationId: "org-1",
      status: InvitationStatus.PENDING,
      acceptedAt: null,
      revokedAt: null,
    });
    // Old hash replaced; the new stored hash matches the freshly emailed token.
    expect(updateArg?.data.tokenHash).not.toBe("OLD_HASH");
    expect(hashInvitationToken(rawTokenFrom(sent?.acceptUrl))).toBe(updateArg?.data.tokenHash);

    expect(sent?.to).toBe(existing.email);
    expect(sent?.organizationName).toBe("Acme Logistics");
    expect(sent?.inviterName).toBe("Alex Admin");
  });

  it("resolves a null inviter when the invitation has no invitedByUserId", async () => {
    const { service, tx, prisma, mail } = buildService();
    let sent: InvitationEmailMessage | undefined;
    tx.invitation.findFirst.mockResolvedValue(
      makeInvitation({ invitedByUserId: null, expiresAt: new Date(Date.now() + 60_000) }),
    );
    tx.invitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.organization.findUnique.mockResolvedValue({ name: "Acme Logistics" });
    mail.sendInvitationEmail.mockImplementation((message: InvitationEmailMessage) => {
      sent = message;
      return Promise.resolve();
    });

    await service.resendInvitation("org-1", "inv-1");

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(sent?.inviterName).toBeNull();
  });

  it("does not resend an invitation from another organization (tenant-scoped load)", async () => {
    const { service, tx, mail } = buildService();
    // The invitation belongs to org-B; a scoped load for org-A returns null.
    tx.invitation.findFirst.mockResolvedValue(null);

    await expect(service.resendInvitation("org-A", "inv-belongs-to-org-B")).rejects.toBeInstanceOf(
      InvitationNotFoundError,
    );
    expect(tx.invitation.findFirst).toHaveBeenCalledWith({
      where: { id: "inv-belongs-to-org-B", organizationId: "org-A" },
    });
    expect(tx.invitation.updateMany).not.toHaveBeenCalled();
    expect(mail.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("throws InvitationNotFoundError and does not write or email when missing", async () => {
    const { service, tx, mail } = buildService();
    tx.invitation.findFirst.mockResolvedValue(null);

    await expect(service.resendInvitation("org-1", "missing")).rejects.toBeInstanceOf(
      InvitationNotFoundError,
    );
    expect(tx.invitation.updateMany).not.toHaveBeenCalled();
    expect(mail.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("throws InvitationRevokedError for a revoked invitation without writing or emailing", async () => {
    const { service, tx, mail } = buildService();
    tx.invitation.findFirst.mockResolvedValue(
      makeInvitation({ revokedAt: new Date(), status: InvitationStatus.REVOKED }),
    );

    await expect(service.resendInvitation("org-1", "inv-1")).rejects.toBeInstanceOf(
      InvitationRevokedError,
    );
    expect(tx.invitation.updateMany).not.toHaveBeenCalled();
    expect(mail.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("surfaces the precise error when the compare-and-set matches zero rows (concurrent revoke)", async () => {
    const { service, tx, mail } = buildService();
    // Load sees an active invitation; by the time the CAS runs it was revoked
    // by a concurrent request, so updateMany matches nothing (count 0) and the
    // re-read reports the true reason.
    tx.invitation.findFirst
      .mockResolvedValueOnce(makeInvitation({ expiresAt: new Date(Date.now() + 60_000) }))
      .mockResolvedValueOnce(makeInvitation({ revokedAt: new Date(), status: InvitationStatus.REVOKED }));
    tx.invitation.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.resendInvitation("org-1", "inv-1")).rejects.toBeInstanceOf(
      InvitationRevokedError,
    );
    expect(mail.sendInvitationEmail).not.toHaveBeenCalled();
  });
});

describe("InvitationService.revokeInvitation", () => {
  it("compare-and-sets REVOKED with a timestamp, scoped to the organization, and sends no email", async () => {
    const { service, tx, mail } = buildService();
    let updateArg: UpdateManyArgs | undefined;
    tx.invitation.findFirst.mockResolvedValue(makeInvitation({ expiresAt: new Date(Date.now() + 60_000) }));
    tx.invitation.updateMany.mockImplementation((args: UpdateManyArgs) => {
      updateArg = args;
      return Promise.resolve({ count: 1 });
    });

    const summary = await service.revokeInvitation("org-1", "inv-1");

    expect(tx.invitation.findFirst).toHaveBeenCalledWith({
      where: { id: "inv-1", organizationId: "org-1" },
    });
    expect(updateArg?.where).toEqual({
      id: "inv-1",
      organizationId: "org-1",
      status: InvitationStatus.PENDING,
      acceptedAt: null,
      revokedAt: null,
    });
    expect(updateArg?.data.status).toBe(InvitationStatus.REVOKED);
    expect(updateArg?.data.revokedAt).toBeInstanceOf(Date);
    expect(mail.sendInvitationEmail).not.toHaveBeenCalled();
    expect(summary.status).toBe(InvitationStatus.REVOKED);
  });

  it("does not revoke an invitation from another organization (tenant-scoped load)", async () => {
    const { service, tx } = buildService();
    tx.invitation.findFirst.mockResolvedValue(null);

    await expect(service.revokeInvitation("org-A", "inv-belongs-to-org-B")).rejects.toBeInstanceOf(
      InvitationNotFoundError,
    );
    expect(tx.invitation.findFirst).toHaveBeenCalledWith({
      where: { id: "inv-belongs-to-org-B", organizationId: "org-A" },
    });
    expect(tx.invitation.updateMany).not.toHaveBeenCalled();
  });

  it("throws InvitationAlreadyAcceptedError for an accepted invitation without writing", async () => {
    const { service, tx } = buildService();
    tx.invitation.findFirst.mockResolvedValue(
      makeInvitation({ acceptedAt: new Date(), status: InvitationStatus.ACCEPTED }),
    );

    await expect(service.revokeInvitation("org-1", "inv-1")).rejects.toBeInstanceOf(
      InvitationAlreadyAcceptedError,
    );
    expect(tx.invitation.updateMany).not.toHaveBeenCalled();
  });

  it("throws InvitationNotFoundError when the invitation does not exist", async () => {
    const { service, tx } = buildService();
    tx.invitation.findFirst.mockResolvedValue(null);

    await expect(service.revokeInvitation("org-1", "missing")).rejects.toBeInstanceOf(
      InvitationNotFoundError,
    );
    expect(tx.invitation.updateMany).not.toHaveBeenCalled();
  });

  it("surfaces the precise error when the compare-and-set matches zero rows (concurrent accept)", async () => {
    const { service, tx } = buildService();
    tx.invitation.findFirst
      .mockResolvedValueOnce(makeInvitation({ expiresAt: new Date(Date.now() + 60_000) }))
      .mockResolvedValueOnce(makeInvitation({ acceptedAt: new Date(), status: InvitationStatus.ACCEPTED }));
    tx.invitation.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.revokeInvitation("org-1", "inv-1")).rejects.toBeInstanceOf(
      InvitationAlreadyAcceptedError,
    );
  });
});

describe("InvitationService.listInvitations", () => {
  type ListArgs = {
    where: { organizationId: string };
    select: Record<string, boolean>;
    orderBy: { createdAt: "asc" | "desc" };
  };

  const SAFE_FIELDS = ["createdAt", "email", "expiresAt", "id", "role", "status"];

  function listRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "inv-1",
      email: "member@example.com",
      role: MembershipRole.DISPATCHER,
      status: InvitationStatus.PENDING,
      expiresAt: new Date("2026-07-17T00:00:00.000Z"),
      createdAt: new Date("2026-07-10T00:00:00.000Z"),
      ...overrides,
    };
  }

  it("scopes the query to the organization (tenant isolation) in a single read", async () => {
    const { service, prisma } = buildService();
    let listArgs: ListArgs | undefined;
    prisma.invitation.findMany.mockImplementation((args: ListArgs) => {
      listArgs = args;
      return Promise.resolve([]);
    });

    await service.listInvitations("org-1");

    expect(prisma.invitation.findMany).toHaveBeenCalledTimes(1); // one query, no N+1
    expect(listArgs?.where).toEqual({ organizationId: "org-1" });
  });

  it("never issues an unscoped query for another tenant's id", async () => {
    const { service, prisma } = buildService();
    let listArgs: ListArgs | undefined;
    prisma.invitation.findMany.mockImplementation((args: ListArgs) => {
      listArgs = args;
      return Promise.resolve([]);
    });

    await service.listInvitations("org-B");

    expect(listArgs?.where.organizationId).toBe("org-B");
    expect(Object.keys(listArgs?.where ?? {})).toEqual(["organizationId"]);
  });

  it("orders by createdAt DESC (newest first)", async () => {
    const { service, prisma } = buildService();
    let listArgs: ListArgs | undefined;
    prisma.invitation.findMany.mockImplementation((args: ListArgs) => {
      listArgs = args;
      return Promise.resolve([]);
    });

    await service.listInvitations("org-1");

    expect(listArgs?.orderBy).toEqual({ createdAt: "desc" });
  });

  it("selects only the safe fields — never tokenHash, acceptedAt, revokedAt or the inviter", async () => {
    const { service, prisma } = buildService();
    let listArgs: ListArgs | undefined;
    prisma.invitation.findMany.mockImplementation((args: ListArgs) => {
      listArgs = args;
      return Promise.resolve([]);
    });

    await service.listInvitations("org-1");

    const select = listArgs?.select ?? {};
    expect(Object.keys(select).sort()).toEqual(SAFE_FIELDS);
    for (const secret of ["tokenHash", "acceptedAt", "revokedAt", "invitedByUserId", "invitedBy"]) {
      expect(select).not.toHaveProperty(secret);
    }
  });

  it("returns only the expected fields, with no token, tokenHash or acceptUrl in the payload", async () => {
    const { service, prisma } = buildService();
    const rows = [
      listRow({ id: "inv-2", createdAt: new Date("2026-07-11T00:00:00.000Z") }),
      listRow({ id: "inv-1", status: InvitationStatus.REVOKED }),
    ];
    prisma.invitation.findMany.mockResolvedValue(rows);

    const result = await service.listInvitations("org-1");

    expect(result).toHaveLength(2);
    for (const item of result) {
      expect(Object.keys(item).sort()).toEqual(SAFE_FIELDS);
    }

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain("acceptUrl");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("/invite/");
  });
});

describe("InvitationService.validateInvitationToken", () => {
  // 43-char base64url shape — what generateInvitationToken produces.
  const VALID_TOKEN = "A".repeat(43);

  function validRow(
    overrides: Partial<Invitation> = {},
    invitedBy: { firstName: string; lastName: string } | null = { firstName: "Alex", lastName: "Admin" },
  ) {
    return {
      ...makeInvitation({ expiresAt: new Date(Date.now() + 60_000), ...overrides }),
      organization: { name: "Acme Logistics" },
      invitedBy,
    };
  }

  it("rejects malformed / empty / whitespace-only tokens without querying", async () => {
    const { service, prisma } = buildService();

    for (const bad of ["", "   ", "not a token", "short", "A".repeat(44)]) {
      await expect(service.validateInvitationToken(bad)).rejects.toBeInstanceOf(InvitationNotFoundError);
    }
    expect(prisma.invitation.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown token (no matching hash)", async () => {
    const { service, prisma } = buildService();
    prisma.invitation.findUnique.mockResolvedValue(null);

    await expect(service.validateInvitationToken(VALID_TOKEN)).rejects.toBeInstanceOf(
      InvitationNotFoundError,
    );
  });

  it("looks up by tokenHash (never the raw token) with the relations in one query", async () => {
    const { service, prisma } = buildService();
    prisma.invitation.findUnique.mockResolvedValue(validRow());

    await service.validateInvitationToken(VALID_TOKEN);

    expect(prisma.invitation.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashInvitationToken(VALID_TOKEN) },
      include: {
        organization: { select: { name: true } },
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });
  });

  it("rejects a revoked invitation", async () => {
    const { service, prisma } = buildService();
    prisma.invitation.findUnique.mockResolvedValue(
      validRow({ revokedAt: new Date(), status: InvitationStatus.REVOKED }),
    );

    await expect(service.validateInvitationToken(VALID_TOKEN)).rejects.toBeInstanceOf(
      InvitationRevokedError,
    );
  });

  it("rejects an accepted invitation", async () => {
    const { service, prisma } = buildService();
    prisma.invitation.findUnique.mockResolvedValue(
      validRow({ acceptedAt: new Date(), status: InvitationStatus.ACCEPTED }),
    );

    await expect(service.validateInvitationToken(VALID_TOKEN)).rejects.toBeInstanceOf(
      InvitationAlreadyAcceptedError,
    );
  });

  it("rejects an expired invitation", async () => {
    const { service, prisma } = buildService();
    prisma.invitation.findUnique.mockResolvedValue(validRow({ expiresAt: new Date(Date.now() - 1000) }));

    await expect(service.validateInvitationToken(VALID_TOKEN)).rejects.toBeInstanceOf(
      InvitationExpiredError,
    );
  });

  it("returns safe, display-ready information for a valid invitation in a single query", async () => {
    const { service, prisma } = buildService();
    prisma.invitation.findUnique.mockResolvedValue(validRow());

    const result = await service.validateInvitationToken(VALID_TOKEN);

    expect(result).toMatchObject({
      invitationId: "inv-1",
      organizationId: "org-1",
      organizationName: "Acme Logistics",
      email: "member@example.com",
      role: MembershipRole.DISPATCHER,
      inviterDisplayName: "Alex Admin",
    });
    expect(result.expiresAt).toBeInstanceOf(Date);
    // Exactly the safe fields — nothing more leaks through.
    expect(Object.keys(result).sort()).toEqual([
      "email",
      "expiresAt",
      "invitationId",
      "inviterDisplayName",
      "organizationId",
      "organizationName",
      "role",
    ]);
    // Organization + inviter loaded in the same lookup — no follow-up queries.
    expect(prisma.invitation.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns a null inviter display name when there is no inviter", async () => {
    const { service, prisma } = buildService();
    prisma.invitation.findUnique.mockResolvedValue(validRow({ invitedByUserId: null }, null));

    const result = await service.validateInvitationToken(VALID_TOKEN);

    expect(result.inviterDisplayName).toBeNull();
  });

  it("never includes the token or tokenHash in the returned payload", async () => {
    const { service, prisma } = buildService();
    prisma.invitation.findUnique.mockResolvedValue(validRow());

    const result = await service.validateInvitationToken(VALID_TOKEN);

    const keys = Object.keys(result);
    expect(keys).not.toContain("token");
    expect(keys).not.toContain("tokenHash");
    expect(keys).not.toContain("acceptUrl");
    expect(JSON.stringify(result)).not.toContain(hashInvitationToken(VALID_TOKEN));
  });
});

describe("InvitationService.acceptInvitation", () => {
  const VALID_TOKEN = "A".repeat(43);
  const ACCEPT_INPUT = {
    rawToken: VALID_TOKEN,
    firstName: "New",
    lastName: "User",
    password: "s3cret-Password!",
  };

  type ConsumeArgs = {
    where: {
      id: string;
      organizationId: string;
      status: InvitationStatus;
      acceptedAt: null;
      revokedAt: null;
      expiresAt: { gt: Date };
    };
    data: { status: InvitationStatus; acceptedAt: Date };
  };
  type UserCreateArgs = {
    data: { email: string; firstName: string; lastName: string; passwordHash: string; status: UserStatus };
  };
  type UserUpdateArgs = {
    where: { id: string };
    data: { passwordHash?: string; status?: UserStatus };
  };
  type MembershipCreateArgs = {
    data: { organizationId: string; userId: string; role: MembershipRole; status: MembershipStatus };
  };

  // The row validateInvitationToken() reads (base client), with relations.
  function validatedRow(overrides: Partial<Invitation> = {}) {
    return {
      ...makeInvitation({ expiresAt: new Date(Date.now() + 60_000), ...overrides }),
      organization: { name: "Acme Logistics" },
      invitedBy: { firstName: "Alex", lastName: "Admin" },
    };
  }

  // Happy path: a brand-new user joining an active organization.
  function primeNewUser(ctx: ReturnType<typeof buildService>) {
    ctx.prisma.invitation.findUnique.mockResolvedValue(validatedRow()); // validate() read
    ctx.prisma.user.findUnique.mockResolvedValue(null); // pre-read: no existing user
    ctx.tx.invitation.updateMany.mockResolvedValue({ count: 1 }); // CAS wins
    ctx.tx.organization.findUnique.mockResolvedValue({ status: OrganizationStatus.ACTIVE });
    ctx.tx.user.findUnique.mockResolvedValue(null); // in-tx: no existing user
    ctx.tx.user.create.mockResolvedValue({ id: "user-1", email: "member@example.com" });
    ctx.tx.membership.findUnique.mockResolvedValue(null);
    ctx.tx.membership.create.mockResolvedValue({ id: "mem-1" });
  }

  it("first acceptance: consumes, creates the user + membership, returns safe fields", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    let consumeArgs: ConsumeArgs | undefined;
    let userCreateArgs: UserCreateArgs | undefined;
    let membershipCreateArgs: MembershipCreateArgs | undefined;
    ctx.tx.invitation.updateMany.mockImplementation((args: ConsumeArgs) => {
      consumeArgs = args;
      return Promise.resolve({ count: 1 });
    });
    ctx.tx.user.create.mockImplementation((args: UserCreateArgs) => {
      userCreateArgs = args;
      return Promise.resolve({ id: "user-1", email: args.data.email });
    });
    ctx.tx.membership.create.mockImplementation((args: MembershipCreateArgs) => {
      membershipCreateArgs = args;
      return Promise.resolve({ id: "mem-1" });
    });

    const result = await ctx.service.acceptInvitation(ACCEPT_INPUT);

    // Password hashed via the shared PasswordService; never stored in plaintext.
    expect(ctx.password.hash).toHaveBeenCalledWith("s3cret-Password!");
    expect(userCreateArgs?.data.passwordHash).toBe("hashed-pw");
    expect(userCreateArgs?.data.status).toBe(UserStatus.ACTIVE);
    expect(JSON.stringify(userCreateArgs)).not.toContain("s3cret-Password!");

    // Consume is a compare-and-set to ACCEPTED on the open-invitation predicate.
    expect(consumeArgs?.where.id).toBe("inv-1");
    expect(consumeArgs?.where.organizationId).toBe("org-1");
    expect(consumeArgs?.where.status).toBe(InvitationStatus.PENDING);
    expect(consumeArgs?.where.acceptedAt).toBeNull();
    expect(consumeArgs?.where.revokedAt).toBeNull();
    expect(consumeArgs?.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(consumeArgs?.data.status).toBe(InvitationStatus.ACCEPTED);

    expect(membershipCreateArgs?.data).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      role: MembershipRole.DISPATCHER,
      status: MembershipStatus.ACTIVE,
    });

    expect(result).toEqual({ userId: "user-1", organizationId: "org-1", role: MembershipRole.DISPATCHER });
  });

  it("rejects a duplicate acceptance when the invitation is already accepted", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.prisma.invitation.findUnique.mockResolvedValue(
      validatedRow({ acceptedAt: new Date(), status: InvitationStatus.ACCEPTED }),
    );

    await expect(ctx.service.acceptInvitation(ACCEPT_INPUT)).rejects.toBeInstanceOf(
      InvitationAlreadyAcceptedError,
    );
    // Fails at validation, before any write or hashing.
    expect(ctx.password.hash).not.toHaveBeenCalled();
    expect(ctx.tx.invitation.updateMany).not.toHaveBeenCalled();
    expect(ctx.tx.user.create).not.toHaveBeenCalled();
  });

  it("reuses an existing active user and skips argon2 when they already have a password", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.prisma.user.findUnique.mockResolvedValue({ passwordHash: "existing-hash" }); // pre-read
    ctx.tx.user.findUnique.mockResolvedValue({
      id: "existing-1",
      status: UserStatus.ACTIVE,
      passwordHash: "existing-hash",
      deletedAt: null,
    });

    const result = await ctx.service.acceptInvitation(ACCEPT_INPUT);

    expect(ctx.password.hash).not.toHaveBeenCalled(); // performance: no wasted hash
    expect(ctx.tx.user.create).not.toHaveBeenCalled(); // no duplicate user
    expect(ctx.tx.user.update).not.toHaveBeenCalled(); // password never overwritten
    expect(result.userId).toBe("existing-1");
  });

  it("never reuses a soft-deleted user", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.prisma.user.findUnique.mockResolvedValue({ passwordHash: "existing-hash" });
    ctx.tx.user.findUnique.mockResolvedValue({
      id: "deleted-1",
      status: UserStatus.ACTIVE,
      passwordHash: "existing-hash",
      deletedAt: new Date(),
    });

    await expect(ctx.service.acceptInvitation(ACCEPT_INPUT)).rejects.toBeInstanceOf(
      InvitationAccountUnavailableError,
    );
    expect(ctx.tx.user.update).not.toHaveBeenCalled();
    expect(ctx.tx.membership.create).not.toHaveBeenCalled();
  });

  it("rejects a disabled user", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.prisma.user.findUnique.mockResolvedValue({ passwordHash: "existing-hash" });
    ctx.tx.user.findUnique.mockResolvedValue({
      id: "disabled-1",
      status: UserStatus.DISABLED,
      passwordHash: "existing-hash",
      deletedAt: null,
    });

    await expect(ctx.service.acceptInvitation(ACCEPT_INPUT)).rejects.toBeInstanceOf(
      InvitationAccountUnavailableError,
    );
    expect(ctx.tx.membership.create).not.toHaveBeenCalled();
  });

  it("initializes a passwordless invited user: sets the password and activates", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.prisma.user.findUnique.mockResolvedValue({ passwordHash: null }); // pre-read: passwordless
    ctx.tx.user.findUnique.mockResolvedValue({
      id: "invited-1",
      status: UserStatus.INVITED,
      passwordHash: null,
      deletedAt: null,
    });
    let updateArgs: UserUpdateArgs | undefined;
    ctx.tx.user.update.mockImplementation((args: UserUpdateArgs) => {
      updateArgs = args;
      return Promise.resolve({ id: "invited-1" });
    });

    const result = await ctx.service.acceptInvitation(ACCEPT_INPUT);

    expect(ctx.password.hash).toHaveBeenCalledWith("s3cret-Password!");
    expect(updateArgs?.where).toEqual({ id: "invited-1" });
    expect(updateArgs?.data.passwordHash).toBe("hashed-pw");
    expect(updateArgs?.data.status).toBe(UserStatus.ACTIVE);
    expect(ctx.tx.user.create).not.toHaveBeenCalled();
    expect(result.userId).toBe("invited-1");
  });

  it("sets a password for an existing active user that has none, without changing status", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.prisma.user.findUnique.mockResolvedValue({ passwordHash: null });
    ctx.tx.user.findUnique.mockResolvedValue({
      id: "active-nopw",
      status: UserStatus.ACTIVE,
      passwordHash: null,
      deletedAt: null,
    });
    let updateArgs: UserUpdateArgs | undefined;
    ctx.tx.user.update.mockImplementation((args: UserUpdateArgs) => {
      updateArgs = args;
      return Promise.resolve({ id: "active-nopw" });
    });

    await ctx.service.acceptInvitation(ACCEPT_INPUT);

    expect(updateArgs?.data.passwordHash).toBe("hashed-pw");
    expect(updateArgs?.data.status).toBeUndefined();
  });

  it("rejects when the user is already a member of the organization", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.prisma.user.findUnique.mockResolvedValue({ passwordHash: "existing-hash" });
    ctx.tx.user.findUnique.mockResolvedValue({
      id: "existing-1",
      status: UserStatus.ACTIVE,
      passwordHash: "existing-hash",
      deletedAt: null,
    });
    ctx.tx.membership.findUnique.mockResolvedValue({ id: "mem-existing" });

    await expect(ctx.service.acceptInvitation(ACCEPT_INPUT)).rejects.toBeInstanceOf(
      MembershipAlreadyExistsError,
    );
    expect(ctx.tx.membership.create).not.toHaveBeenCalled();
  });

  it("rejects acceptance into a suspended organization", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.tx.organization.findUnique.mockResolvedValue({ status: OrganizationStatus.SUSPENDED });

    await expect(ctx.service.acceptInvitation(ACCEPT_INPUT)).rejects.toBeInstanceOf(
      InvitationOrganizationInactiveError,
    );
    // Rejected before any user/membership work.
    expect(ctx.tx.user.findUnique).not.toHaveBeenCalled();
    expect(ctx.tx.user.create).not.toHaveBeenCalled();
  });

  it("rejects acceptance into an archived organization", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.tx.organization.findUnique.mockResolvedValue({ status: OrganizationStatus.ARCHIVED });

    await expect(ctx.service.acceptInvitation(ACCEPT_INPUT)).rejects.toBeInstanceOf(
      InvitationOrganizationInactiveError,
    );
  });

  it("maps a P2002 on user create to a clean processing-conflict error", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }),
    );

    await expect(ctx.service.acceptInvitation(ACCEPT_INPUT)).rejects.toBeInstanceOf(
      InvitationProcessingConflictError,
    );
  });

  it("maps a P2002 on membership create to MembershipAlreadyExistsError", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.tx.membership.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }),
    );

    await expect(ctx.service.acceptInvitation(ACCEPT_INPUT)).rejects.toBeInstanceOf(
      MembershipAlreadyExistsError,
    );
  });

  it("is concurrency-safe: the CAS loser gets the precise error and touches no user/membership", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.tx.invitation.updateMany.mockResolvedValue({ count: 0 });
    ctx.tx.invitation.findFirst.mockResolvedValue(
      makeInvitation({ acceptedAt: new Date(), status: InvitationStatus.ACCEPTED }),
    );

    await expect(ctx.service.acceptInvitation(ACCEPT_INPUT)).rejects.toBeInstanceOf(
      InvitationAlreadyAcceptedError,
    );
    expect(ctx.tx.user.findUnique).not.toHaveBeenCalled();
    expect(ctx.tx.user.create).not.toHaveBeenCalled();
  });

  it("rejects when the invitation expires between validation and the transaction", async () => {
    const ctx = buildService();
    primeNewUser(ctx);
    ctx.tx.invitation.updateMany.mockResolvedValue({ count: 0 });
    ctx.tx.invitation.findFirst.mockResolvedValue(makeInvitation({ expiresAt: new Date(Date.now() - 1000) }));

    await expect(ctx.service.acceptInvitation(ACCEPT_INPUT)).rejects.toBeInstanceOf(InvitationExpiredError);
    expect(ctx.tx.user.create).not.toHaveBeenCalled();
  });

  it("returns a payload with no password, hash, token, or tokenHash", async () => {
    const ctx = buildService();
    primeNewUser(ctx);

    const result = await ctx.service.acceptInvitation(ACCEPT_INPUT);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("s3cret-Password!");
    expect(serialized).not.toContain("hashed-pw");
    expect(serialized).not.toContain(hashInvitationToken(VALID_TOKEN));
    expect(Object.keys(result).sort()).toEqual(["organizationId", "role", "userId"]);
  });
});
