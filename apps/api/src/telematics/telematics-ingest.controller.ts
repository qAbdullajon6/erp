import { BadRequestException, Body, Controller, Headers, Logger, Param, Post, Query, UnauthorizedException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { DeviceService } from "./devices/device.service";
import { ProviderRegistry } from "./providers/provider-registry";
import { ProviderNormalizationError, type NormalizedPosition } from "./providers/telematics-provider.interface";
import { TrackingService } from "./tracking/tracking.service";

/// The device ingestion endpoint — NOT session-authenticated.
///
/// A GPS unit authenticates with its per-device ingest secret (the one shown
/// once at device creation), presented as `X-Ingest-Secret` or `?secret=`. The
/// path names the device; DeviceService verifies the secret in constant time
/// and yields the org, vehicle and provider, so the device never names a tenant
/// or a vehicle it could spoof.
///
/// Rate limiting is skipped here deliberately: a busy fleet legitimately posts
/// hundreds of fixes a minute from one egress IP, which the global IP throttle
/// would trip. The secret IS the gate — an unauthenticated post is rejected
/// before any work. (Per-device rate limiting is TD-TELEMATICS-06.)
///
/// The body is accepted raw (provider-shaped) and handed to the matching
/// normalizer; Traccar Client posts its fields on the query string, so those
/// are merged into the body so both transports normalize identically.
@SkipThrottle()
@Controller("telematics/ingest")
export class TelematicsIngestController {
  private readonly logger = new Logger(TelematicsIngestController.name);

  constructor(
    private readonly devices: DeviceService,
    private readonly tracking: TrackingService,
    private readonly providers: ProviderRegistry,
  ) {}

  @Post(":deviceId")
  async ingest(
    @Param("deviceId") deviceId: string,
    @Headers("x-ingest-secret") headerSecret: string | undefined,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    const secret = headerSecret || (typeof query.secret === "string" ? query.secret : undefined);
    if (!secret) {
      this.logger.warn(`Ingest rejected: no secret presented (deviceId=${deviceId})`);
      throw new UnauthorizedException("Missing device ingest secret");
    }

    // Never logs `secret` itself — authenticateForIngest logs the outcome
    // (unknown device / bad secret / unbound device), never the value.
    const device = await this.devices.authenticateForIngest(deviceId, secret);
    const provider = this.providers.forType(device.provider);

    // Traccar Client sends fields as query params; merge them under the body so
    // one code path handles both transports. `secret` is stripped so it never
    // reaches the normalizer as if it were a data field.
    const queryData = { ...query };
    delete queryData.secret;
    const bodyHasData = body != null && typeof body === "object" && Object.keys(body).length > 0;
    const payload = bodyHasData ? body : Object.keys(queryData).length > 0 ? queryData : body;

    let positions: NormalizedPosition[];
    try {
      positions = provider.normalize(payload);
    } catch (err) {
      if (err instanceof ProviderNormalizationError) {
        this.logger.warn(
          `Ingest rejected: malformed ${device.provider} payload (deviceId=${deviceId}, org=${device.organizationId}): ${err.message}`,
        );
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    this.logger.log(
      `Ingest received: ${positions.length} position(s) from ${device.provider} (deviceId=${deviceId}, org=${device.organizationId}, vehicleId=${device.vehicleId})`,
    );

    // Cross-check the payload's own device identifier (Traccar's `id` /
    // uniqueId — the IMEI, for Navtelecom and Teltonika alike, since Traccar
    // normalizes the wire protocol away before this webhook fires) against
    // what THIS url+secret is actually authorized for. The secret alone
    // already stops an unregistered device from reaching this pipeline at
    // all; this additionally stops a *misconfigured* Traccar notification —
    // e.g. one device's webhook accidentally wired to another device's
    // FlowERP URL — from writing its positions onto the wrong vehicle. A
    // position with no identifier at all (some protocols/transports never
    // send one) is not treated as a mismatch — there is nothing to check.
    const mismatched = positions.find(
      (p) => p.externalDeviceId != null && p.externalDeviceId !== device.externalId,
    );
    if (mismatched) {
      this.logger.warn(
        `Ingest rejected: device identity mismatch — url authorizes externalId=${device.externalId} ` +
          `but payload reports externalId=${mismatched.externalDeviceId} ` +
          `(deviceId=${deviceId}, org=${device.organizationId}, provider=${device.provider})`,
      );
      throw new UnauthorizedException(
        "Payload device identifier does not match the authenticated device",
      );
    }

    const result = await this.tracking.receiveForDevice(
      device.organizationId,
      { vehicleId: device.vehicleId, deviceId: device.deviceId },
      positions,
    );

    this.logger.log(
      `Ingest complete: accepted=${result.accepted} rejected=${result.rejected} ` +
        `(deviceId=${deviceId}, org=${device.organizationId}, vehicleId=${device.vehicleId})`,
    );

    return result;
  }
}
