import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { UpdateDispatchStatusDto } from "../dto/update-dispatch-status.dto";
import { DriverDispatchService } from "./driver-dispatch.service";

/// The driver's endpoints (Task 8.12) — deliberately a controller of their own.
///
/// A driver's needs are not a subset of a dispatcher's; they are a different job.
/// They see one trip at a time, they see the customer's phone number and the
/// delivery notes, and they will soon need proof of delivery, a photo, a signature,
/// an ETA. None of that belongs on the dispatcher's controller, and bolting it there
/// is how a controller becomes a swamp. So the split is made now, while it is free.
///
/// ## Route ordering matters
///
/// These paths live under the same `dispatches` prefix as DispatchesController's
/// `@Get(":id")`. Nest matches routes in the order their CONTROLLERS are registered,
/// so this one is listed FIRST in DispatchModule — otherwise a request for
/// `/dispatches/my` is happily parsed as a dispatch whose id is the string "my",
/// and the driver gets a 404 from the wrong handler. There is a test for exactly
/// that, because it is the kind of thing that works until someone reorders an array.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("DRIVER")
@Controller("dispatches/my")
export class DriverDispatchController {
  constructor(private readonly driverDispatches: DriverDispatchService) {}

  /// The caller's own dispatches. There is no driverId parameter, by design: the
  /// driver is resolved from the authenticated user, so there is nothing to tamper
  /// with.
  @Get()
  listMine(
    @CurrentUser() user: CurrentUserPayload,
    @Query("includeFinished") includeFinished?: string,
  ) {
    return this.driverDispatches.listMine(
      user.organizationId,
      user.userId,
      includeFinished === "true",
    );
  }

  @Get(":id")
  getMine(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.driverDispatches.getMine(user.organizationId, user.userId, id);
  }

  /// "I am on my way." "I have arrived." "I am loaded." "It is delivered."
  ///
  /// The driver moves the DISPATCH; the order follows by projection (R3). Which
  /// transitions are legal is the server's answer, served on every dispatch as
  /// `allowedTransitions` and enforced again here — the phone is never trusted to
  /// restrict itself.
  @Post(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateDispatchStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.driverDispatches.updateStatus(user.organizationId, user.userId, id, dto, user);
  }
}
