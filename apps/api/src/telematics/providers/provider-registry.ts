import { Injectable } from "@nestjs/common";
import { TelematicsProviderType } from "@prisma/client";
import { GeotabProvider } from "./geotab.provider";
import { ManualProvider } from "./manual.provider";
import { SamsaraProvider } from "./samsara.provider";
import { TraccarProvider } from "./traccar.provider";
import { ProviderNormalizationError, type TelematicsProvider } from "./telematics-provider.interface";

/// Resolves a device's provider type to its normalizer. The single lookup
/// point the ingestion pipeline uses so it never branches on vendor itself —
/// it asks the registry for "the normalizer for this device" and gets one.
@Injectable()
export class ProviderRegistry {
  private readonly byType: Map<TelematicsProviderType, TelematicsProvider>;

  constructor(
    manual: ManualProvider,
    traccar: TraccarProvider,
    samsara: SamsaraProvider,
    geotab: GeotabProvider,
  ) {
    this.byType = new Map<TelematicsProviderType, TelematicsProvider>([
      [TelematicsProviderType.MANUAL, manual],
      // The generic webhook contract IS our normalised shape, which is exactly
      // what ManualProvider validates — so it is reused rather than duplicated.
      [TelematicsProviderType.GENERIC_WEBHOOK, manual],
      [TelematicsProviderType.TRACCAR, traccar],
      [TelematicsProviderType.SAMSARA, samsara],
      [TelematicsProviderType.GEOTAB, geotab],
    ]);
  }

  forType(type: TelematicsProviderType): TelematicsProvider {
    const provider = this.byType.get(type);
    if (!provider) {
      throw new ProviderNormalizationError(`No telematics provider registered for "${type}"`);
    }
    return provider;
  }
}
