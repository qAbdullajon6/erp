import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { AuditService, AuditLogEntry } from "../../audit/audit.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AssignmentQueries } from "../assignment/assignment.queries";
import { DispatchConflictsService } from "./dispatch-conflicts.service";
import type { DispatchConflict } from "./dispatch-conflict.types";

const ORG_ID = "org-1";
const DISPATCH_ID = "dispatch-1";
const ACTOR: CurrentUserPayload = {
  userId: "user-1",
  membershipId: "mem-1",
  organizationId: ORG_ID,
  role: "ADMIN",
  email: "admin@test.com",
  isPlatformAdmin: false,
};

function makeConflict(
  overrides: Partial<DispatchConflict> & Pick<DispatchConflict, "id" | "type" | "severity">,
): DispatchConflict {
  return {
    category: "schedule",
    message: overrides.message ?? "Conflict message",
    description: "Description",
    recommendation: "Recommendation",
    recommendations: [],
    autoResolvable: false,
    ignored: false,
    resolved: false,
    detectedAt: "2026-07-29T12:00:00.000Z",
    ...overrides,
  };
}

function buildService(options?: {
  existingStates?: Array<{
    conflictKey: string;
    firstDetectedAt?: Date;
    ignoredAt?: Date | null;
    resolvedAt?: Date | null;
  }>;
  detected?: DispatchConflict[];
}) {
  const auditLog = jest
    .fn<(entry: AuditLogEntry) => Promise<void>>()
    .mockResolvedValue(undefined);
  const findMany = jest.fn<any>().mockResolvedValue(
    (options?.existingStates ?? []).map((state) => ({
      id: `state-${state.conflictKey}`,
      ...state,
      organizationId: ORG_ID,
      dispatchId: DISPATCH_ID,
      type: "schedule.late_pickup",
      severity: "high",
      ignoredAt: state.ignoredAt ?? null,
      ignoredByUserId: null,
      resolvedAt: state.resolvedAt ?? null,
      resolvedByUserId: null,
      firstDetectedAt: state.firstDetectedAt ?? new Date("2026-07-29T10:00:00.000Z"),
      lastDetectedAt: new Date("2026-07-29T10:00:00.000Z"),
      createdAt: new Date("2026-07-29T10:00:00.000Z"),
      updatedAt: new Date("2026-07-29T10:00:00.000Z"),
      resolvedBy: null,
    })),
  );
  const upsert = jest.fn<any>().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
    id: `state-${create.conflictKey}`,
    organizationId: ORG_ID,
    dispatchId: DISPATCH_ID,
    conflictKey: create.conflictKey,
    type: create.type,
    severity: create.severity,
    ignoredAt: null,
    ignoredByUserId: null,
    resolvedAt: null,
    resolvedByUserId: null,
    firstDetectedAt: create.firstDetectedAt,
    lastDetectedAt: create.lastDetectedAt,
    createdAt: new Date("2026-07-29T12:00:00.000Z"),
    updatedAt: new Date("2026-07-29T12:00:00.000Z"),
  }));
  const update = jest.fn<any>().mockResolvedValue({
    id: "state-conflict-a",
    organizationId: ORG_ID,
    dispatchId: DISPATCH_ID,
    conflictKey: "conflict-a",
    type: "schedule.late_pickup",
    severity: "high",
    ignoredAt: new Date("2026-07-29T12:00:00.000Z"),
    ignoredByUserId: ACTOR.userId,
    resolvedAt: null,
    resolvedByUserId: null,
    firstDetectedAt: new Date("2026-07-29T12:00:00.000Z"),
    lastDetectedAt: new Date("2026-07-29T12:00:00.000Z"),
    createdAt: new Date("2026-07-29T12:00:00.000Z"),
    updatedAt: new Date("2026-07-29T12:00:00.000Z"),
  });

  const prisma = {
    dispatchConflictState: { findMany, upsert, update },
  } as unknown as PrismaService;

  const service = new DispatchConflictsService(
    prisma,
    {} as AssignmentQueries,
    { log: auditLog } as unknown as AuditService,
  );

  jest
    .spyOn(service as unknown as { detectRaw: () => Promise<DispatchConflict[]> }, "detectRaw")
    .mockResolvedValue(
      options?.detected ?? [
        makeConflict({
          id: "conflict-a",
          type: "schedule.late_pickup",
          severity: "high",
        }),
        makeConflict({
          id: "conflict-b",
          type: "vehicle.inspection_expired",
          severity: "critical",
        }),
      ],
    );

  return { service, auditLog, findMany, upsert, update };
}

describe("DispatchConflictsService conflict_detected audit", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("writes one dispatch.conflict_detected audit on first detection", async () => {
    const { service, auditLog, upsert } = buildService({ existingStates: [] });

    await service.getConflicts(ORG_ID, DISPATCH_ID);

    const detectedCalls = auditLog.mock.calls.filter(
      ([entry]) => entry.action === "dispatch.conflict_detected",
    );
    expect(detectedCalls).toHaveLength(1);
    expect(detectedCalls[0]?.[0]).toMatchObject({
      action: "dispatch.conflict_detected",
      entityType: "Dispatch",
      entityId: DISPATCH_ID,
      metadata: {
        dispatchId: DISPATCH_ID,
        count: 2,
        highestSeverity: "critical",
        types: ["schedule.late_pickup", "vehicle.inspection_expired"],
      },
    });
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate dispatch.conflict_detected on repeated recheck", async () => {
    const { service, auditLog } = buildService({
      existingStates: [
        { conflictKey: "conflict-a" },
        { conflictKey: "conflict-b" },
      ],
    });

    await service.getConflicts(ORG_ID, DISPATCH_ID);
    await service.checkConflicts(ORG_ID, DISPATCH_ID, { recordAudit: true }, ACTOR);

    const detectedCalls = auditLog.mock.calls.filter(
      ([entry]) => entry.action === "dispatch.conflict_detected",
    );
    const recheckedCalls = auditLog.mock.calls.filter(
      ([entry]) => entry.action === "dispatch.conflict_rechecked",
    );

    expect(detectedCalls).toHaveLength(0);
    expect(recheckedCalls).toHaveLength(1);
  });

  it("writes a new dispatch.conflict_detected audit when a later conflict appears", async () => {
    const { service, auditLog } = buildService({
      existingStates: [{ conflictKey: "conflict-a", resolvedAt: new Date("2026-07-29T11:00:00.000Z") }],
      detected: [
        makeConflict({
          id: "conflict-a",
          type: "schedule.late_pickup",
          severity: "high",
        }),
        makeConflict({
          id: "conflict-c",
          type: "business.credit_hold",
          severity: "medium",
        }),
      ],
    });

    await service.getConflicts(ORG_ID, DISPATCH_ID);

    const detectedCalls = auditLog.mock.calls.filter(
      ([entry]) => entry.action === "dispatch.conflict_detected",
    );
    expect(detectedCalls).toHaveLength(1);
    expect(detectedCalls[0]?.[0].metadata).toMatchObject({
      dispatchId: DISPATCH_ID,
      count: 1,
      highestSeverity: "medium",
      types: ["business.credit_hold"],
    });
  });

  it("does not write dispatch.conflict_detected during live preview checks", async () => {
    const { service, auditLog, upsert } = buildService({ existingStates: [] });

    await service.checkConflicts(
      ORG_ID,
      DISPATCH_ID,
      { driverId: "driver-2", recordAudit: false },
      ACTOR,
    );

    expect(
      auditLog.mock.calls.filter(([entry]) => entry.action === "dispatch.conflict_detected"),
    ).toHaveLength(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("writes dispatch.conflict_detected before ignore when state did not exist yet", async () => {
    const { service, auditLog, update } = buildService({ existingStates: [] });

    await service.ignoreConflict(ORG_ID, DISPATCH_ID, "conflict-a", ACTOR);

    const actions = auditLog.mock.calls.map(([entry]) => entry.action);
    expect(actions).toEqual(["dispatch.conflict_detected", "dispatch.conflict_ignored"]);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
