import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DriverDocumentType, DriverLicenseClass } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { DriverDocumentsService } from "./driver-documents.service";

// ── helpers ───────────────────────────────────────────────────────────────────

const ORG = "org-1";
const DRV = "drv-1";
const DOC = "doc-1";

const ACTOR = { userId: "user-1", organizationId: ORG, role: "ADMIN" } as any;
const DISPATCHER_ACTOR = { userId: "user-2", organizationId: ORG, role: "DISPATCHER" } as any;

function makeDoc(overrides: Partial<any> = {}) {
  return {
    id: DOC,
    organizationId: ORG,
    driverId: DRV,
    type: "DRIVER_LICENSE" as DriverDocumentType,
    documentNumber: "ABC-123",
    issueDate: new Date("2022-01-01"),
    expiryDate: new Date("2030-01-01"),
    fileName: null,
    storagePath: null,
    mimeType: null,
    fileSizeBytes: null,
    licenseClass: "CLASS_B" as DriverLicenseClass,
    endorsements: null,
    uploadedByUserId: null,
    verifiedAt: null,
    verifiedByUserId: null,
    rejectedAt: null,
    rejectedByUserId: null,
    rejectionReason: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDriver() {
  return { id: DRV, organizationId: ORG };
}

function makePrisma() {
  return {
    driver: {
      findFirst: jest.fn().mockResolvedValue(makeDriver()),
      update: jest.fn().mockResolvedValue({}),
    },
    driverDocument: {
      findFirst: jest.fn().mockResolvedValue(makeDoc()),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(makeDoc()),
      update: jest.fn().mockResolvedValue(makeDoc()),
      delete: jest.fn().mockResolvedValue(makeDoc()),
    },
    notificationSettings: {
      findFirst: jest.fn().mockResolvedValue({ expiryWarningDays: 30 }),
    },
    $transaction: jest.fn().mockImplementation(async (ops: any[]) => {
      return Promise.all(ops);
    }),
  };
}

function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

async function buildSvc(prismaOverride?: Partial<ReturnType<typeof makePrisma>>) {
  const prisma = { ...makePrisma(), ...prismaOverride };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DriverDocumentsService,
      { provide: PrismaService, useValue: prisma as any },
      { provide: AuditService, useValue: makeAudit() },
    ],
  }).compile();
  return { svc: module.get(DriverDocumentsService), prisma };
}

// ── list ──────────────────────────────────────────────────────────────────────

describe("DriverDocumentsService.list", () => {
  it("throws 404 when driver not in org", async () => {
    const { svc, prisma } = await buildSvc();
    prisma.driver.findFirst.mockResolvedValue(null);
    await expect(svc.list(ORG, DRV)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns virtual MISSING entries for tracked types with no DB row", async () => {
    const { svc } = await buildSvc();
    const { items } = await svc.list(ORG, DRV);
    const license = items.find((d) => d.type === "DRIVER_LICENSE")!;
    expect(license.id).toBeNull();
    expect(license.status).toBe("MISSING");
  });

  it("returns NOT_REQUIRED for optional type with no row", async () => {
    const { svc } = await buildSvc();
    const { items } = await svc.list(ORG, DRV);
    const adr = items.find((d) => d.type === "ADR_CERTIFICATE")!;
    expect(adr.status).toBe("NOT_REQUIRED");
  });

  it("computes EXPIRED when expiryDate is in the past", async () => {
    const { svc, prisma } = await buildSvc();
    const expiredDoc = makeDoc({
      storagePath: "/some/path",
      verifiedAt: new Date("2023-01-01"),
      expiryDate: new Date("2020-01-01"),
    });
    prisma.driverDocument.findMany.mockResolvedValue([expiredDoc]);
    const { items } = await svc.list(ORG, DRV);
    const license = items.find((d) => d.type === "DRIVER_LICENSE")!;
    expect(license.status).toBe("EXPIRED");
  });

  it("computes EXPIRING_SOON within threshold", async () => {
    const { svc, prisma } = await buildSvc();
    const soon = new Date();
    soon.setDate(soon.getDate() + 15); // 15 days out, threshold is 30
    const doc = makeDoc({ storagePath: "/p", verifiedAt: new Date(), expiryDate: soon });
    prisma.driverDocument.findMany.mockResolvedValue([doc]);
    const { items } = await svc.list(ORG, DRV);
    expect(items.find((d) => d.type === "DRIVER_LICENSE")!.status).toBe("EXPIRING_SOON");
  });

  it("computes PENDING_REVIEW when file is missing", async () => {
    const { svc, prisma } = await buildSvc();
    prisma.driverDocument.findMany.mockResolvedValue([makeDoc({ storagePath: null })]);
    const { items } = await svc.list(ORG, DRV);
    expect(items.find((d) => d.type === "DRIVER_LICENSE")!.status).toBe("PENDING_REVIEW");
  });

  it("computes REJECTED when rejectedAt is set", async () => {
    const { svc, prisma } = await buildSvc();
    prisma.driverDocument.findMany.mockResolvedValue([
      makeDoc({ rejectedAt: new Date() }),
    ]);
    const { items } = await svc.list(ORG, DRV);
    expect(items.find((d) => d.type === "DRIVER_LICENSE")!.status).toBe("REJECTED");
  });

  it("computes VALID when file is present, verified, and not expiring", async () => {
    const { svc, prisma } = await buildSvc();
    const far = new Date();
    far.setFullYear(far.getFullYear() + 5);
    prisma.driverDocument.findMany.mockResolvedValue([
      makeDoc({ storagePath: "/p", verifiedAt: new Date(), expiryDate: far }),
    ]);
    const { items } = await svc.list(ORG, DRV);
    expect(items.find((d) => d.type === "DRIVER_LICENSE")!.status).toBe("VALID");
  });
});

// ── create ────────────────────────────────────────────────────────────────────

describe("DriverDocumentsService.create", () => {
  it("syncs license fields to Driver on DRIVER_LICENSE create", async () => {
    const { svc, prisma } = await buildSvc();
    // driverDocument.findFirst for existing-check → null (no duplicate)
    prisma.driverDocument.findFirst.mockResolvedValue(null);
    prisma.driverDocument.create.mockResolvedValue(makeDoc());

    await svc.create(ORG, DRV, {
      type: "DRIVER_LICENSE",
      documentNumber: "LIC-001",
      issueDate: "2022-01-01",
      expiryDate: "2030-01-01",
      licenseClass: "CLASS_B",
    }, ACTOR);

    expect(prisma.driver.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ licenseNumber: "ABC-123" }),
      }),
    );
  });

  it("throws if a document of same type already exists", async () => {
    const { svc, prisma } = await buildSvc();
    prisma.driverDocument.findFirst.mockResolvedValue(makeDoc());
    await expect(
      svc.create(ORG, DRV, { type: "DRIVER_LICENSE" } as any, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── remove ────────────────────────────────────────────────────────────────────

describe("DriverDocumentsService.remove", () => {
  it("clears Driver license flat fields when DRIVER_LICENSE document is removed", async () => {
    const { svc, prisma } = await buildSvc();
    await svc.remove(ORG, DRV, DOC, ACTOR);

    expect(prisma.$transaction).toHaveBeenCalled();
    const [deleteOp, updateOp] = (prisma.$transaction as jest.Mock).mock.calls[0][0];
    // Both ops should be included in the transaction
    expect(deleteOp).toBeDefined();
    expect(updateOp).toBeDefined();
  });

  it("does NOT call $transaction for non-license documents", async () => {
    const { svc, prisma } = await buildSvc();
    prisma.driverDocument.findFirst.mockResolvedValue(makeDoc({ type: "PASSPORT_ID" }));
    await svc.remove(ORG, DRV, DOC, ACTOR);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.driverDocument.delete).toHaveBeenCalledWith({ where: { id: DOC } });
  });
});

// ── syncLicenseToDriver (null clearing) ───────────────────────────────────────

describe("DriverDocumentsService.update (null sync)", () => {
  it("clears Driver licenseNumber when documentNumber is set to null", async () => {
    const { svc, prisma } = await buildSvc();
    const updatedDoc = makeDoc({ documentNumber: null });
    prisma.driverDocument.update.mockResolvedValue(updatedDoc);

    await svc.update(ORG, DRV, DOC, { documentNumber: null } as any, ACTOR);

    expect(prisma.driver.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ licenseNumber: null }),
      }),
    );
  });

  it("clears Driver licenseClass when licenseClass is set to null", async () => {
    const { svc, prisma } = await buildSvc();
    const updatedDoc = makeDoc({ licenseClass: null });
    prisma.driverDocument.update.mockResolvedValue(updatedDoc);

    await svc.update(ORG, DRV, DOC, { licenseClass: null } as any, ACTOR);

    expect(prisma.driver.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ licenseClass: null }),
      }),
    );
  });
});

// ── verify/reject RBAC ────────────────────────────────────────────────────────

describe("DriverDocumentsService.verify", () => {
  it("allows ADMIN to verify", async () => {
    const { svc, prisma } = await buildSvc();
    const doc = makeDoc({ storagePath: "/file.pdf" });
    prisma.driverDocument.findFirst.mockResolvedValue(doc);
    prisma.driverDocument.update.mockResolvedValue({ ...doc, verifiedAt: new Date() });
    await expect(svc.verify(ORG, DRV, DOC, ACTOR)).resolves.toBeDefined();
  });

  it("throws ForbiddenException for DISPATCHER on verify", async () => {
    const { svc } = await buildSvc();
    await expect(svc.verify(ORG, DRV, DOC, DISPATCHER_ACTOR)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws BadRequestException when no file is uploaded", async () => {
    const { svc, prisma } = await buildSvc();
    prisma.driverDocument.findFirst.mockResolvedValue(makeDoc({ storagePath: null }));
    await expect(svc.verify(ORG, DRV, DOC, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("DriverDocumentsService.reject", () => {
  it("throws ForbiddenException for DISPATCHER on reject", async () => {
    const { svc } = await buildSvc();
    await expect(svc.reject(ORG, DRV, DOC, "reason", DISPATCHER_ACTOR)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows OPERATIONS_MANAGER to reject", async () => {
    const { svc, prisma } = await buildSvc();
    const opsActor = { ...ACTOR, role: "OPERATIONS_MANAGER" };
    prisma.driverDocument.update.mockResolvedValue(makeDoc({ rejectedAt: new Date(), rejectionReason: "reason" }));
    await expect(svc.reject(ORG, DRV, DOC, "reason", opsActor)).resolves.toBeDefined();
  });
});

// ── tenant isolation ──────────────────────────────────────────────────────────

describe("DriverDocumentsService tenant isolation", () => {
  it("throws NotFoundException when driverId not in org", async () => {
    const { svc, prisma } = await buildSvc();
    prisma.driver.findFirst.mockResolvedValue(null);
    await expect(svc.list("wrong-org", DRV)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException when doc not found in org", async () => {
    const { svc, prisma } = await buildSvc();
    prisma.driverDocument.findFirst.mockResolvedValue(null);
    await expect(svc.verify(ORG, DRV, DOC, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
  });
});
