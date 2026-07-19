import { BadRequestException, Body, Controller, Headers, Param, Post, Query, UnauthorizedException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { DeviceService } from "./devices/device.service";
import { IngestionService } from "./ingestion/ingestion.service";
import { ProviderRegistry } from "./providers/provider-registry";
import { ProviderNormalizationError } from "./providers/telematics-provider.interface";

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
  constructor(
    private readonly devices: DeviceService,
    private readonly ingestion: IngestionService,
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
      throw new UnauthorizedException("Missing device ingest secret");
    }

    const device = await this.devices.authenticateForIngest(deviceId, secret);
    const provider = this.providers.forType(device.provider);

    // Traccar Client sends fields as query params; merge them under the body so
    // one code path handles both transports. `secret` is stripped so it never
    // reaches the normalizer as if it were a data field.
    const { secret: _omit, ...queryData } = query;
    const bodyHasData = body != null && typeof body === "object" && Object.keys(body as object).length > 0;
    const payload = bodyHasData ? body : Object.keys(queryData).length > 0 ? queryData : body;

    let positions;
    try {
      positions = provider.normalize(payload);
    } catch (err) {
      if (err instanceof ProviderNormalizationError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    return this.ingestion.ingestForVehicle(
      { organizationId: device.organizationId, vehicleId: device.vehicleId, deviceId: device.deviceId },
      positions,
    );
  }
}
