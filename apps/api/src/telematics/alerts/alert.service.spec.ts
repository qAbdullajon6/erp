import { AlertService, type RaiseAlertInput } from "./alert.service";

/// Verifies the alert engine's dedupe contract with mocked collaborators — the
/// part that keeps a sustained condition from spamming one alert per GPS ping.
describe("AlertService (dedupe engine)", () => {
  let prisma: any;
  let realtime: any;
  let workflow: any;
  let audit: any;
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
    prisma = {
      telematicsAlert: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    realtime = { publish: jest.fn() };
    workflow = { emit: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AlertService(prisma, realtime, workflow, audit);
  });

  it("creates a new alert and fans out when no open alert shares the dedupe key", async () => {
    prisma.telematicsAlert.findUnique.mockResolvedValue(null);
    prisma.telematicsAlert.create.mockResolvedValue({ id: "a1", ...base, status: "OPEN" });

    const { isNew } = await service.raise(base);

    expect(isNew).toBe(true);
    expect(prisma.telematicsAlert.create).toHaveBeenCalledTimes(1);
    expect(realtime.publish).toHaveBeenCalledTimes(1);
    expect(workflow.emit).toHaveBeenCalledWith("org-1", "telematics.alert.raised", expect.objectContaining({ type: "SPEEDING" }));
  });

  it("updates the existing open alert and does NOT re-fan-out for a sustained condition", async () => {
    prisma.telematicsAlert.findUnique.mockResolvedValue({ id: "a1", value: 100, latitude: null, longitude: null });
    prisma.telematicsAlert.update.mockResolvedValue({ id: "a1", ...base, status: "OPEN" });

    const { isNew } = await service.raise({ ...base, value: 120 });

    expect(isNew).toBe(false);
    expect(prisma.telematicsAlert.create).not.toHaveBeenCalled();
    expect(prisma.telematicsAlert.update).toHaveBeenCalledTimes(1);
    // No new notification/workflow storm on every subsequent ping.
    expect(workflow.emit).not.toHaveBeenCalled();
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it("autoResolve clears an open alert and releases its dedupe slot", async () => {
    prisma.telematicsAlert.findUnique.mockResolvedValue({ id: "a1", status: "OPEN", metadata: null });
    prisma.telematicsAlert.update.mockResolvedValue({});

    await service.autoResolve("org-1", "speeding:veh-1");

    expect(prisma.telematicsAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: expect.objectContaining({ status: "RESOLVED", dedupeKey: null }),
      }),
    );
  });

  it("autoResolve is a no-op when nothing is open for the key", async () => {
    prisma.telematicsAlert.findUnique.mockResolvedValue(null);
    await service.autoResolve("org-1", "speeding:veh-1");
    expect(prisma.telematicsAlert.update).not.toHaveBeenCalled();
  });
});
