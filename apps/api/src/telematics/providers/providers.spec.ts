import { GeotabProvider } from "./geotab.provider";
import { ManualProvider } from "./manual.provider";
import { SamsaraProvider } from "./samsara.provider";
import { KNOTS_TO_KPH, MPH_TO_KPH, ProviderNormalizationError } from "./telematics-provider.interface";
import { TraccarProvider } from "./traccar.provider";

describe("telematics providers", () => {
  describe("ManualProvider", () => {
    const provider = new ManualProvider();

    it("normalises a single normalised-shape position", () => {
      const [p] = provider.normalize({
        deviceId: "dev-1",
        latitude: 41.3,
        longitude: 69.24,
        speedKph: 50,
        heading: 180,
        recordedAt: "2026-07-17T10:00:00Z",
        ignitionOn: true,
      });
      expect(p.latitude).toBe(41.3);
      expect(p.speedKph).toBe(50);
      expect(p.ignitionOn).toBe(true);
      expect(p.externalDeviceId).toBe("dev-1");
    });

    it("accepts an array and lat/lng aliases", () => {
      const out = provider.normalize([
        { lat: 1, lng: 2 },
        { lat: 3, lon: 4 },
      ]);
      expect(out).toHaveLength(2);
      expect(out[1].longitude).toBe(4);
    });

    it("rejects a position without coordinates", () => {
      expect(() => provider.normalize({ speedKph: 10 })).toThrow(ProviderNormalizationError);
    });

    it("defaults recordedAt to now when absent", () => {
      const [p] = provider.normalize({ lat: 1, lng: 2 });
      expect(p.recordedAt).toBeInstanceOf(Date);
      expect(Number.isNaN(p.recordedAt.getTime())).toBe(false);
    });
  });

  describe("TraccarProvider", () => {
    const provider = new TraccarProvider();

    it("converts knots to km/h and epoch seconds to a Date", () => {
      const [p] = provider.normalize({
        id: 12345,
        lat: 41.3,
        lon: 69.24,
        speed: 10, // knots
        bearing: 90,
        timestamp: 1_752_746_400, // epoch seconds
        batt: 3900, // millivolts
      });
      expect(p.externalDeviceId).toBe("12345");
      expect(p.speedKph).toBeCloseTo(10 * KNOTS_TO_KPH, 5);
      expect(p.heading).toBe(90);
      expect(p.recordedAt.getUTCFullYear()).toBe(2025);
      expect(p.health?.batteryVoltage).toBeCloseTo(3.9, 5);
    });

    it("throws when lat/lon are missing", () => {
      expect(() => provider.normalize({ id: "x", speed: 1 })).toThrow(ProviderNormalizationError);
    });

    it("parses Traccar's own nested {position, device} webhook shape, reading the IMEI from device.uniqueId", () => {
      // Verified empirically against a live traccar/traccar:6.4 container's
      // forward.url output — see docs/TRACCAR_SETUP.md Section 2, Step 3.
      const [p] = provider.normalize({
        position: {
          id: 7,
          deviceId: 1, // Traccar's own row id — must NOT become externalDeviceId
          protocol: "navtelecom",
          fixTime: "2026-08-08T10:53:17.000Z",
          latitude: 41.3222,
          longitude: 69.2666,
          speed: 10, // knots
          course: 270,
          altitude: 470,
          valid: true,
        },
        device: {
          id: 1,
          uniqueId: "862531043215285",
          name: "S-2423",
        },
      });
      expect(p.externalDeviceId).toBe("862531043215285");
      expect(p.latitude).toBeCloseTo(41.3222, 5);
      expect(p.longitude).toBeCloseTo(69.2666, 5);
      expect(p.speedKph).toBeCloseTo(10 * KNOTS_TO_KPH, 5);
      expect(p.heading).toBe(270);
      expect(p.recordedAt.toISOString()).toBe("2026-08-08T10:53:17.000Z");
    });
  });

  describe("SamsaraProvider", () => {
    const provider = new SamsaraProvider();

    it("maps the data[].gps envelope and converts mph", () => {
      const out = provider.normalize({
        eventType: "GpsUpdated",
        data: [
          {
            id: "281474976710655",
            name: "Truck 7",
            gps: { latitude: 41.3, longitude: 69.24, headingDegrees: 270, speedMilesPerHour: 40, time: "2026-07-17T10:00:00Z" },
          },
        ],
      });
      expect(out).toHaveLength(1);
      expect(out[0].externalDeviceId).toBe("281474976710655");
      expect(out[0].speedKph).toBeCloseTo(40 * MPH_TO_KPH, 5);
      expect(out[0].heading).toBe(270);
    });
  });

  describe("GeotabProvider", () => {
    const provider = new GeotabProvider();

    it("maps device.id and treats speed as km/h", () => {
      const [p] = provider.normalize({
        device: { id: "b123" },
        latitude: 41.3,
        longitude: 69.24,
        speed: 88,
        bearing: 45,
        isDriving: true,
        dateTime: "2026-07-17T10:00:00Z",
      });
      expect(p.externalDeviceId).toBe("b123");
      expect(p.speedKph).toBe(88);
      expect(p.ignitionOn).toBe(true);
    });
  });
});
