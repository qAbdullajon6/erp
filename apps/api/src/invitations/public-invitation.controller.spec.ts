import "reflect-metadata";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import type { InvitationService } from "./invitation.service";
import { PublicInvitationController } from "./public-invitation.controller";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import { InvitationExpiredError, InvitationNotFoundError } from "./invitation.errors";

function build() {
  const invitationService = {
    validateInvitationToken: jest.fn(),
    acceptInvitation: jest.fn(),
  };
  const controller = new PublicInvitationController(invitationService as unknown as InvitationService);
  return { controller, invitationService };
}

function acceptDto(overrides: Partial<AcceptInvitationDto> = {}): AcceptInvitationDto {
  return {
    token: "A".repeat(43),
    firstName: "New",
    lastName: "User",
    password: "s3cret-Password!",
    ...overrides,
  };
}

describe("PublicInvitationController.validate (GET /invite/:token)", () => {
  it("delegates to validateInvitationToken and returns the service response", async () => {
    const { controller, invitationService } = build();
    const result = {
      invitationId: "inv-1",
      organizationId: "org-1",
      organizationName: "Acme Logistics",
      email: "new@example.com",
      role: "DISPATCHER",
      inviterDisplayName: "Alex Admin",
      expiresAt: new Date(),
    };
    invitationService.validateInvitationToken.mockResolvedValue(result);

    const returned = await controller.validate("raw-token");

    expect(invitationService.validateInvitationToken).toHaveBeenCalledWith("raw-token");
    expect(returned).toBe(result);
  });

  it("bubbles service domain errors unchanged", async () => {
    const { controller, invitationService } = build();
    invitationService.validateInvitationToken.mockRejectedValue(new InvitationNotFoundError());

    await expect(controller.validate("raw-token")).rejects.toBeInstanceOf(InvitationNotFoundError);
  });
});

describe("PublicInvitationController.accept (POST /invite/accept)", () => {
  it("delegates to acceptInvitation, mapping the DTO to the service input", async () => {
    const { controller, invitationService } = build();
    const result = { userId: "user-1", organizationId: "org-1", role: "DISPATCHER" };
    invitationService.acceptInvitation.mockResolvedValue(result);

    const returned = await controller.accept(acceptDto());

    expect(invitationService.acceptInvitation).toHaveBeenCalledWith({
      rawToken: "A".repeat(43),
      firstName: "New",
      lastName: "User",
      password: "s3cret-Password!",
    });
    expect(returned).toBe(result); // returns the service response unchanged (no JWT/session)
  });

  it("bubbles service domain errors unchanged", async () => {
    const { controller, invitationService } = build();
    invitationService.acceptInvitation.mockRejectedValue(new InvitationExpiredError());

    await expect(controller.accept(acceptDto())).rejects.toBeInstanceOf(InvitationExpiredError);
  });
});

describe("PublicInvitationController — throttling", () => {
  // @Throttle stores its metadata on the handler function itself (descriptor
  // .value), so read it from the property descriptor rather than referencing
  // the method directly.
  function throttlerKeysOf(method: "validate" | "accept"): string[] {
    const descriptor = Object.getOwnPropertyDescriptor(PublicInvitationController.prototype, method);
    return (Reflect.getMetadataKeys(descriptor?.value as object) as string[]).filter((k) =>
      k.startsWith("THROTTLER:"),
    );
  }

  it("applies a @Throttle limit to the validate endpoint", () => {
    expect(throttlerKeysOf("validate").some((k) => k.startsWith("THROTTLER:LIMIT"))).toBe(true);
  });

  it("applies a @Throttle limit to the accept endpoint", () => {
    expect(throttlerKeysOf("accept").some((k) => k.startsWith("THROTTLER:LIMIT"))).toBe(true);
  });
});

describe("AcceptInvitationDto validation", () => {
  it("accepts a valid payload", async () => {
    const errors = await validate(plainToInstance(AcceptInvitationDto, acceptDto()));
    expect(errors).toHaveLength(0);
  });

  it("requires a non-empty token", async () => {
    const errors = await validate(plainToInstance(AcceptInvitationDto, acceptDto({ token: "" })));
    expect(errors.some((e) => e.property === "token")).toBe(true);
  });

  it("requires first and last name", async () => {
    const errors = await validate(
      plainToInstance(AcceptInvitationDto, acceptDto({ firstName: "", lastName: "" })),
    );
    const properties = errors.map((e) => e.property).sort();
    expect(properties).toEqual(["firstName", "lastName"]);
  });

  it("rejects a password shorter than the auth minimum", async () => {
    const errors = await validate(plainToInstance(AcceptInvitationDto, acceptDto({ password: "short" })));
    expect(errors.some((e) => e.property === "password")).toBe(true);
  });

  it("rejects missing required fields", async () => {
    const errors = await validate(plainToInstance(AcceptInvitationDto, {}));
    const properties = errors.map((e) => e.property).sort();
    expect(properties).toEqual(["firstName", "lastName", "password", "token"]);
  });
});
