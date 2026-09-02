import { GeocodingService } from "./geocoding.service";

/// Fixed point returned by the mock geocoder for any input — Tashkent city centre.
const MOCK_LAT = 41.2995;
const MOCK_LNG = 69.2401;

function makeMockMapbox(
  result: { lat: number; lng: number; placeName: string } | null = { lat: MOCK_LAT, lng: MOCK_LNG, placeName: "Tashkent" },
  configured = true,
) {
  return {
    isConfigured: jest.fn().mockReturnValue(configured),
    forwardGeocode: jest.fn().mockResolvedValue(result),
  };
}

function makePrisma(order: Record<string, unknown> | null = null) {
  return {
    order: {
      findFirst: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe("GeocodingService.geocodeAddress", () => {
  it("returns null when Mapbox is unconfigured", async () => {
    const svc = new GeocodingService(makePrisma() as never, makeMockMapbox(null, false) as never);
    expect(await svc.geocodeAddress("some query")).toBeNull();
  });

  it("returns coordinates on success", async () => {
    const svc = new GeocodingService(makePrisma() as never, makeMockMapbox() as never);
    const result = await svc.geocodeAddress("Tashkent, Mirzo Ulugbek");
    expect(result).toEqual({ lat: MOCK_LAT, lng: MOCK_LNG, placeName: "Tashkent" });
  });

  it("returns null and does not throw when Mapbox throws", async () => {
    const mapbox = makeMockMapbox();
    mapbox.forwardGeocode.mockRejectedValue(new Error("network error"));
    const svc = new GeocodingService(makePrisma() as never, mapbox as never);
    expect(await svc.geocodeAddress("any query")).toBeNull();
  });
});

describe("GeocodingService.geocodeOrderLocations", () => {
  const baseOrder = {
    id: "order-1",
    pickupAddress: "Chilonzor 5",
    pickupCity: "Tashkent",
    pickupGeocodedAt: null,
    deliveryAddress: "Sergeli 12",
    deliveryCity: "Tashkent",
    deliveryGeocodedAt: null,
  };

  it("geocodes both pickup and delivery when neither has been geocoded", async () => {
    const prisma = makePrisma(baseOrder);
    const mapbox = makeMockMapbox();
    const svc = new GeocodingService(prisma as never, mapbox as never);

    await svc.geocodeOrderLocations("order-1");

    expect(mapbox.forwardGeocode).toHaveBeenCalledTimes(2);
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-1" },
        data: expect.objectContaining({ geocodeSource: "mapbox" }),
      }),
    );
    const updateData = (prisma.order.update).mock.calls[0][0].data;
    expect(Number(updateData.pickupLat)).toBeCloseTo(MOCK_LAT);
    expect(Number(updateData.pickupLng)).toBeCloseTo(MOCK_LNG);
    expect(Number(updateData.deliveryLat)).toBeCloseTo(MOCK_LAT);
    expect(Number(updateData.deliveryLng)).toBeCloseTo(MOCK_LNG);
    expect(updateData.pickupGeocodedAt).toBeInstanceOf(Date);
    expect(updateData.deliveryGeocodedAt).toBeInstanceOf(Date);
  });

  it("skips pickup when pickupGeocodedAt is already set", async () => {
    const order = { ...baseOrder, pickupGeocodedAt: new Date() };
    const prisma = makePrisma(order);
    const mapbox = makeMockMapbox();
    const svc = new GeocodingService(prisma as never, mapbox as never);

    await svc.geocodeOrderLocations("order-1");

    // Only delivery geocoded
    expect(mapbox.forwardGeocode).toHaveBeenCalledTimes(1);
    const updateData = (prisma.order.update).mock.calls[0][0].data;
    expect(updateData.pickupLat).toBeUndefined();
    expect(Number(updateData.deliveryLat)).toBeCloseTo(MOCK_LAT);
  });

  it("does not call update when Mapbox is unconfigured", async () => {
    const prisma = makePrisma(baseOrder);
    const mapbox = makeMockMapbox(null, false);
    const svc = new GeocodingService(prisma as never, mapbox as never);

    await svc.geocodeOrderLocations("order-1");

    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("persists pickup result even when delivery geocoding fails", async () => {
    const prisma = makePrisma(baseOrder);
    const mapbox = makeMockMapbox();
    let callCount = 0;
    mapbox.forwardGeocode.mockImplementation(() => {
      callCount++;
      if (callCount === 2) throw new Error("network error for delivery");
      return Promise.resolve({ lat: MOCK_LAT, lng: MOCK_LNG, placeName: "Tashkent" });
    });
    const svc = new GeocodingService(prisma as never, mapbox as never);

    await svc.geocodeOrderLocations("order-1");

    // update called with pickup result only
    expect(prisma.order.update).toHaveBeenCalled();
    const updateData = (prisma.order.update).mock.calls[0][0].data;
    expect(Number(updateData.pickupLat)).toBeCloseTo(MOCK_LAT);
    expect(updateData.deliveryLat).toBeUndefined();
  });

  it("does nothing when order is not found", async () => {
    const prisma = makePrisma(null);
    const mapbox = makeMockMapbox();
    const svc = new GeocodingService(prisma as never, mapbox as never);

    await expect(svc.geocodeOrderLocations("missing-id")).resolves.toBeUndefined();
    expect(mapbox.forwardGeocode).not.toHaveBeenCalled();
  });
});
