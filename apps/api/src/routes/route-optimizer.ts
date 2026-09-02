/// Pure, deterministic route optimization algorithm.
/// No NestJS dependencies — fully unit-testable in isolation.
///
/// Algorithm:
///   1. Classify stops: fixed (executed/locked/active) vs eligible (with coords) vs coord-missing
///   2. Run nearest-neighbor greedy from the last fixed stop
///   3. Apply 2-opt local improvement pass
///   4. Preserve pickup→delivery order for same-orderId groups
///   5. Assign eligible stops to the sequence slots they vacate

export interface OptimizableStop {
  id: string;
  sequence: number;
  lat: number | null;
  lng: number | null;
  orderId: string | null;
  isFixed: boolean;
}

export interface OptimizationResult {
  feasible: boolean;
  eligibleCount: number;
  fixedCount: number;
  missingCoordCount: number;
  currentSequence: Array<{ id: string; sequence: number }>;
  proposedSequence: Array<{ id: string; sequence: number }>;
  currentDistanceM: number;
  proposedDistanceM: number;
  distanceSavedM: number;
  changedStopIds: string[];
  warnings: string[];
}

type CoordStop = OptimizableStop & { lat: number; lng: number };

export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δφ = toRad(b.lat - a.lat);
  const Δλ = toRad(b.lng - a.lng);
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function pathDistanceM(stops: CoordStop[]): number {
  let dist = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    dist += haversineM(stops[i], stops[i + 1]);
  }
  return dist;
}

function nearestNeighbor(eligible: CoordStop[], start: { lat: number; lng: number }): CoordStop[] {
  const unvisited = [...eligible];
  const result: CoordStop[] = [];
  let current = start;

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDist = haversineM(current, unvisited[0]);
    for (let i = 1; i < unvisited.length; i++) {
      const d = haversineM(current, unvisited[i]);
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    }
    result.push(unvisited[nearestIdx]);
    current = unvisited[nearestIdx];
    unvisited.splice(nearestIdx, 1);
  }

  return result;
}

function satisfiesDeps(order: CoordStop[], deps: Array<[string, string]>): boolean {
  const pos = new Map(order.map((s, i) => [s.id, i]));
  for (const [first, second] of deps) {
    const a = pos.get(first);
    const b = pos.get(second);
    if (a !== undefined && b !== undefined && a > b) return false;
  }
  return true;
}

function twoOpt(stops: CoordStop[], deps: Array<[string, string]>, maxIter = 100): CoordStop[] {
  if (stops.length < 4) return stops;
  let best = stops;
  let bestDist = pathDistanceM(best);
  let improved = true;
  let iter = 0;

  while (improved && iter < maxIter) {
    improved = false;
    iter++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        if (!satisfiesDeps(candidate, deps)) continue;
        const dist = pathDistanceM(candidate);
        if (dist < bestDist - 1) {
          best = candidate;
          bestDist = dist;
          improved = true;
        }
      }
    }
  }
  return best;
}

function hasCoords(s: OptimizableStop): s is CoordStop {
  return s.lat != null && s.lng != null;
}

export function optimizeStopSequence(stops: OptimizableStop[]): OptimizationResult {
  if (stops.length === 0) {
    return {
      feasible: false,
      eligibleCount: 0,
      fixedCount: 0,
      missingCoordCount: 0,
      currentSequence: [],
      proposedSequence: [],
      currentDistanceM: 0,
      proposedDistanceM: 0,
      distanceSavedM: 0,
      changedStopIds: [],
      warnings: ['No stops to optimize.'],
    };
  }

  const sorted = [...stops].sort((a, b) => a.sequence - b.sequence);
  const currentSequence = sorted.map((s) => ({ id: s.id, sequence: s.sequence }));

  const fixed = sorted.filter((s) => s.isFixed);
  const eligible = sorted.filter((s) => !s.isFixed && hasCoords(s)) as CoordStop[];
  const missingCoordStops = sorted.filter((s) => !s.isFixed && !hasCoords(s));
  const missingCoordCount = missingCoordStops.length;

  // Coord-missing non-fixed stops are treated as fixed (left in place)
  const allFixedIds = new Set([
    ...fixed.map((s) => s.id),
    ...missingCoordStops.map((s) => s.id),
  ]);

  const warnings: string[] = [];
  if (missingCoordCount > 0) {
    warnings.push(
      `${missingCoordCount} stop${missingCoordCount !== 1 ? 's' : ''} lack coordinates and were left in place.`,
    );
  }

  const coordStops = sorted.filter(hasCoords);
  const currentDistanceM = Math.round(pathDistanceM(coordStops));

  if (eligible.length < 2) {
    warnings.push('Fewer than 2 eligible stops with coordinates — no reordering possible.');
    return {
      feasible: false,
      eligibleCount: eligible.length,
      fixedCount: allFixedIds.size,
      missingCoordCount,
      currentSequence,
      proposedSequence: currentSequence,
      currentDistanceM,
      proposedDistanceM: currentDistanceM,
      distanceSavedM: 0,
      changedStopIds: [],
      warnings,
    };
  }

  // Build dependency pairs: within a same-orderId group, preserve relative order
  const deps: Array<[string, string]> = [];
  const byOrder = new Map<string, OptimizableStop[]>();
  for (const s of sorted) {
    if (s.orderId) {
      if (!byOrder.has(s.orderId)) byOrder.set(s.orderId, []);
      byOrder.get(s.orderId)!.push(s);
    }
  }
  for (const group of byOrder.values()) {
    if (group.length < 2) continue;
    const g = [...group].sort((a, b) => a.sequence - b.sequence);
    for (let i = 0; i < g.length - 1; i++) {
      // Only create deps between two eligible stops — fixed ones can't move anyway
      if (!allFixedIds.has(g[i].id) && !allFixedIds.has(g[i + 1].id)) {
        deps.push([g[i].id, g[i + 1].id]);
      }
    }
  }

  // Start nearest-neighbor from the last fixed stop with coords, or first eligible stop
  const fixedWithCoords = sorted.filter((s) => allFixedIds.has(s.id) && hasCoords(s)) as CoordStop[];
  const startPoint: { lat: number; lng: number } = fixedWithCoords.at(-1) ?? eligible[0];

  // Nearest-neighbor then 2-opt
  const nnOrder = nearestNeighbor(eligible, startPoint);
  const optimized = twoOpt(nnOrder, deps);

  // Assign eligible stops to the sequence slots they occupied
  const eligibleSlots = sorted
    .filter((s) => !allFixedIds.has(s.id))
    .map((s) => s.sequence)
    .sort((a, b) => a - b);

  const proposedById = new Map(sorted.map((s) => [s.id, s.sequence]));
  optimized.forEach((s, i) => proposedById.set(s.id, eligibleSlots[i]));

  const proposedSequence = sorted
    .map((s) => ({ id: s.id, sequence: proposedById.get(s.id)! }))
    .sort((a, b) => a.sequence - b.sequence);

  // Proposed distance: sort coord stops by proposed sequence
  const proposedCoordStops = [...coordStops].sort(
    (a, b) => (proposedById.get(a.id) ?? a.sequence) - (proposedById.get(b.id) ?? b.sequence),
  );
  const proposedDistanceM = Math.round(pathDistanceM(proposedCoordStops));
  const distanceSavedM = Math.max(0, currentDistanceM - proposedDistanceM);

  const changedStopIds = proposedSequence
    .filter((p) => currentSequence.find((c) => c.id === p.id)!.sequence !== p.sequence)
    .map((p) => p.id);

  return {
    feasible: true,
    eligibleCount: eligible.length,
    fixedCount: allFixedIds.size,
    missingCoordCount,
    currentSequence,
    proposedSequence,
    currentDistanceM,
    proposedDistanceM,
    distanceSavedM,
    changedStopIds,
    warnings,
  };
}
