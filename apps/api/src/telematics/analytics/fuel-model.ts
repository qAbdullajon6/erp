/// Fuel-consumption estimation.
///
/// The fleet has no per-vehicle fuel-flow sensor and no tank-capacity field, so
/// litres burned cannot be measured directly. This is an openly-approximate
/// model: distance × a nominal consumption rate chosen by vehicle type. It is
/// good enough to compare vehicles and trend cost over time, which is what the
/// fuel analytics are for; it is NOT a fuel-card reconciliation. Every figure
/// derived from it is labelled an estimate in the API and UI.
///
/// Rates are litres per 100 km, mid-range for a laden commercial vehicle.
/// The type match is a case-insensitive substring so "Heavy Truck", "TRUCK"
/// and "truck-40t" all resolve to the truck rate.

const RATE_BY_TYPE: { match: string; litersPer100Km: number }[] = [
  { match: "truck", litersPer100Km: 30 },
  { match: "lorry", litersPer100Km: 30 },
  { match: "trailer", litersPer100Km: 34 },
  { match: "van", litersPer100Km: 12 },
  { match: "pickup", litersPer100Km: 13 },
  { match: "car", litersPer100Km: 8 },
  { match: "motorcycle", litersPer100Km: 4 },
  { match: "bike", litersPer100Km: 4 },
];

export const DEFAULT_LITERS_PER_100KM = 20;

export function litersPer100KmForType(vehicleType: string | null | undefined): number {
  if (!vehicleType) return DEFAULT_LITERS_PER_100KM;
  const needle = vehicleType.toLowerCase();
  const hit = RATE_BY_TYPE.find((r) => needle.includes(r.match));
  return hit ? hit.litersPer100Km : DEFAULT_LITERS_PER_100KM;
}

/// Estimated litres consumed over a distance for a vehicle of the given type.
export function estimateFuelLiters(distanceKm: number, vehicleType: string | null | undefined): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return (distanceKm * litersPer100KmForType(vehicleType)) / 100;
}
