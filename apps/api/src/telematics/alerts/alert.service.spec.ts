import { AlertService, type RaiseAlertInput } from "./alert.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { TelematicsRealtimeService } from "../realtime/telematics-realtime.service";
import type { WorkflowEventService } from "../../workflows/triggers/workflow-event.service";
import type { AuditService } from "../../audit/audit.service";

type TelematicsAlertMock = {
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
};

type AlertServiceMocks = {
  prisma: { telematicsAlert: TelematicsAlertMock };
  realtime: { publish: jest.Mock };
  workflow: { emit: jest.Mock };
  audit: { log: jest.Mock };
};

/// Verifies the alert engine's dedupe contract with mocked collaborators — the
/// part that keeps a sustained condition from spamming one alert per GPS ping.
describe("AlertService (dedupe engine)", () => {
  let mocks: AlertServiceMocks;
  let service: AlertService;

  const base: RaiseAlertInput = {
    organizationId: "org-1",
    type: "SPEEDING",
    severity: "MEDIUM",
    vehicleId: "veh-1",
    title: "t",
    message: "m",
    occurredAt: new Date("2026-07-17T10:00:00Z"),
    dedupeKey: "speeding:veh-1",
  };

  beforeEach(() => {
    mocks = {
      prisma: {
        telematicsAlert: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      },
      realtime: { publish: jest.fn() },
      workflow: { emit: jest.fn().mockResolvedValue(undefined) },
      audit: { log: jest.fn().mockResolvedValue(undefined) },
    };
    service = new AlertService(
      mocks.prisma as unknown as PrismaService,
      mocks.realtime as unknown as TelematicsRealtimeService,
      mocks.workflow as unknown as WorkflowEventService,
      mocks.audit as unknown as AuditService,
    );
  });

  it("creates a new alert and fans out when no open alert shares the dedupe key", async () => {
    mocks.prisma.telematicsAlert.findUnique.mockResolvedValue(null);
    mocks.prisma.telematicsAlert.create.mockResolvedValue({ id: "a1", ...base, status: "OPEN" });

    const { isNew } = await service.raise(base);

    expect(isNew).toBe(true);
    expect(mocks.prisma.telematicsAlert.create).toHaveBeenCalledTimes(1);
    expect(mocks.realtime.publish).toHaveBeenCalledTimes(1);
    expect(mocks.workflow.emit).toHaveBeenCalledWith("org-1", "telematics.alert.raised", expect.objectContaining({ type: "SPEEDING" }));
  });

  it("updates the existing open alert and does NOT re-fan-out for a sustained condition", async () => {
    mocks.prisma.telematicsAlert.findUnique.mockResolvedValue({ id: "a1", value: 100, latitude: null, longitude: null });
    mocks.prisma.telematicsAlert.update.mockResolvedValue({ id: "a1", ...base, status: "OPEN" });

    const { isNew } = await service.raise({ ...base, value: 120 });

    expect(isNew).toBe(false);
    expect(mocks.prisma.telematicsAlert.create).not.toHaveBeenCalled();
    expect(mocks.prisma.telematicsAlert.update).toHaveBeenCalledTimes(1);
    // No new notification/workflow storm on every subsequent ping.
    expect(mocks.workflow.emit).not.toHaveBeenCalled();
    expect(mocks.realtime.publish).not.toHaveBeenCalled();
  });

  it("autoResolve clears an open alert and releases its dedupe slot", async () => {
    mocks.prisma.telematicsAlert.findUnique.mockResolvedValue({ id: "a1", status: "OPEN", metadata: null });
    mocks.prisma.telematicsAlert.update.mockResolvedValue({});

    await service.autoResolve("org-1", "speeding:veh-1");

    expect(mocks.prisma.telematicsAlert.update).toHaveBeenCalledTimes(1);
    const updateCall = mocks.prisma.telematicsAlert.update.mock.calls[0] as
      | [{ where: { id: string }; data: { status: string; dedupeKey: string | null } }]
      | undefined;
    const updateArgs = updateCall?.[0];
    expect(updateArgs).toBeDefined();
    expect(updateArgs!.where).toEqual({ id: "a1" });
    expect(updateArgs!.data.status).toBe("RESOLVED");
    expect(updateArgs!.data.dedupeKey).toBeNull();
  });

  it("autoResolve is a no-op when nothing is open for the key", async () => {
    mocks.prisma.telematicsAlert.findUnique.mockResolvedValue(null);
    await service.autoResolve("org-1", "speeding:veh-1");
    expect(mocks.prisma.telematicsAlert.update).not.toHaveBeenCalled();
  });
});
