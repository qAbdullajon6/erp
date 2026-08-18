import "reflect-metadata";
import type { MembershipRole } from "@prisma/client";
import { ROLES_KEY } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TelematicsDevicesController } from "./telematics-devices.controller";

describe("TelematicsDevicesController authorization wiring", () => {
  it("protects the controller with the existing JWT and role guards", () => {
    const guards = Reflect.getMetadata(
      "__guards__",
      TelematicsDevicesController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(RolesGuard);
  });

  it("allows only ADMIN and OPERATIONS_MANAGER to change device bindings", () => {
    const updateHandler = Object.getOwnPropertyDescriptor(
      TelematicsDevicesController.prototype,
      "update",
    )?.value as object;
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      updateHandler,
    ) as MembershipRole[];

    expect(roles).toEqual(["ADMIN", "OPERATIONS_MANAGER"]);
    expect(roles).not.toContain("DISPATCHER");
    expect(roles).not.toContain("SALES_CRM_MANAGER");
    expect(roles).not.toContain("ACCOUNTANT");
    expect(roles).not.toContain("DRIVER");
  });
});
