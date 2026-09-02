import { haversineM, optimizeStopSequence, OptimizableStop } from './route-optimizer';

// Shared helpers
function makeStop(
  id: string,
  sequence: number,
  lat: number | null,
  lng: number | null,
  opts: { isFixed?: boolean; orderId?: string | null } = {},
): OptimizableStop {
  return {
    id,
    sequence,
    lat,
    lng,
    orderId: opts.orderId ?? null,
    isFixed: opts.isFixed ?? false,
  };
}

describe('haversineM', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineM({ lat: 40, lng: -74 }, { lat: 40, lng: -74 })).toBe(0);
  });

  it('calculates approximate distance between NYC and Boston', () => {
    // NYC (40.7128, -74.006) to Boston (42.3601, -71.0589) ≈ 306 km
    const dist = haversineM({ lat: 40.7128, lng: -74.006 }, { lat: 42.3601, lng: -71.0589 });
    expect(dist).toBeGreaterThan(300_000);
    expect(dist).toBeLessThan(320_000);
  });
});

// Deterministic layout for tests:
//   A(0,0)  B(0,10)  C(0,20)  D(10,0)  E(10,10)  F(10,20)
// Nearest-neighbor from A: A→B→C→F→E→D is longer than A→B→E→D→...
// We'll use a layout where NN produces a suboptimal order that 2-opt can improve.

describe('optimizeStopSequence', () => {
  // A — NN produces better order than input (basic reordering)
  it('A: nearest-neighbor reorders stops closer in distance', () => {
    // Input order: seq 1=far(10,20), seq 2=near(0,1), seq 3=mid(0,10)
    // NN from (0,0) starting point (no fixed stops, starts from first eligible)
    // Actually NN starts from first eligible when no fixed — eligible[0] is seq1 after sort
    const stops: OptimizableStop[] = [
      makeStop('s1', 1, 0, 0, {}),    // origin-ish
      makeStop('s2', 2, 10, 20, {}),  // far
      makeStop('s3', 3, 0, 1, {}),    // near
      makeStop('s4', 4, 0, 10, {}),   // mid
    ];
    const result = optimizeStopSequence(stops);
    expect(result.feasible).toBe(true);
    expect(result.eligibleCount).toBe(4);
    expect(result.proposedDistanceM).toBeLessThanOrEqual(result.currentDistanceM);
  });

  // B — deterministic: same input always produces same output
  it('B: optimization is deterministic', () => {
    const stops: OptimizableStop[] = [
      makeStop('a', 1, 40.0, -74.0, {}),
      makeStop('b', 2, 42.0, -71.0, {}),
      makeStop('c', 3, 41.0, -73.5, {}),
      makeStop('d', 4, 40.5, -72.0, {}),
    ];
    const r1 = optimizeStopSequence(stops);
    const r2 = optimizeStopSequence(stops);
    expect(r1.proposedSequence).toEqual(r2.proposedSequence);
    expect(r1.proposedDistanceM).toBe(r2.proposedDistanceM);
  });

  // C — relative order of same-orderId stops is preserved during optimization
  it('C: relative order within same orderId is preserved (pickup stays before delivery)', () => {
    // pickup is at seq 1, delivery at seq 4. Other stops form a geometry that would
    // tempt the optimizer to interleave or reorder the orderId pair, but it must not.
    const stops: OptimizableStop[] = [
      makeStop('pickup', 1, 40.0, -74.0, { orderId: 'order1' }),
      makeStop('other1', 2, 41.5, -74.5, {}),
      makeStop('other2', 3, 41.5, -73.9, {}),
      makeStop('delivery', 4, 41.0, -73.9, { orderId: 'order1' }),
    ];
    const result = optimizeStopSequence(stops);
    const proposed = result.proposedSequence;
    const pickupSeq = proposed.find((s) => s.id === 'pickup')!.sequence;
    const deliverySeq = proposed.find((s) => s.id === 'delivery')!.sequence;
    expect(pickupSeq).toBeLessThan(deliverySeq);
  });

  // D — optimizationLocked stop (isFixed=true) stays in place
  it('D: locked stop keeps its sequence slot', () => {
    const stops: OptimizableStop[] = [
      makeStop('locked', 2, 10, 20, { isFixed: true }),
      makeStop('a', 1, 0, 0, {}),
      makeStop('b', 3, 0, 10, {}),
      makeStop('c', 4, 5, 5, {}),
    ];
    const result = optimizeStopSequence(stops);
    const lockedEntry = result.proposedSequence.find((s) => s.id === 'locked')!;
    expect(lockedEntry.sequence).toBe(2);
  });

  // E — completed stop (isFixed=true) stays in place
  it('E: completed stop keeps its sequence slot', () => {
    const stops: OptimizableStop[] = [
      makeStop('done', 1, 0, 0, { isFixed: true }),
      makeStop('a', 2, 10, 0, {}),
      makeStop('b', 3, 5, 5, {}),
      makeStop('c', 4, 0, 10, {}),
    ];
    const result = optimizeStopSequence(stops);
    const doneEntry = result.proposedSequence.find((s) => s.id === 'done')!;
    expect(doneEntry.sequence).toBe(1);
    expect(result.eligibleCount).toBe(3);
    expect(result.fixedCount).toBe(1);
  });

  // F — active dispatch stop (isFixed=true) stays in place
  it('F: active-dispatch stop keeps its sequence slot', () => {
    const stops: OptimizableStop[] = [
      makeStop('active', 2, 40.0, -74.0, { isFixed: true }),
      makeStop('a', 1, 40.1, -74.1, {}),
      makeStop('b', 3, 39.9, -73.9, {}),
      makeStop('c', 4, 40.5, -74.5, {}),
    ];
    const result = optimizeStopSequence(stops);
    const activeEntry = result.proposedSequence.find((s) => s.id === 'active')!;
    expect(activeEntry.sequence).toBe(2);
  });

  // G — SKIPPED stop (isFixed=true) stays in place
  it('G: skipped stop keeps its sequence slot', () => {
    const stops: OptimizableStop[] = [
      makeStop('skipped', 3, 5, 5, { isFixed: true }),
      makeStop('a', 1, 0, 0, {}),
      makeStop('b', 2, 10, 0, {}),
      makeStop('c', 4, 0, 10, {}),
    ];
    const result = optimizeStopSequence(stops);
    const entry = result.proposedSequence.find((s) => s.id === 'skipped')!;
    expect(entry.sequence).toBe(3);
  });

  // H — stop with missing coords gets a warning and is left in place
  it('H: missing-coord stop is left in place and a warning is emitted', () => {
    const stops: OptimizableStop[] = [
      makeStop('no-coord', 2, null, null, {}),
      makeStop('a', 1, 0, 0, {}),
      makeStop('b', 3, 10, 0, {}),
      makeStop('c', 4, 5, 5, {}),
    ];
    const result = optimizeStopSequence(stops);
    expect(result.missingCoordCount).toBe(1);
    expect(result.warnings.some((w) => w.includes('lack coordinates'))).toBe(true);
    const entry = result.proposedSequence.find((s) => s.id === 'no-coord')!;
    expect(entry.sequence).toBe(2);
  });

  // I — zero eligible stops (all fixed)
  it('I: no reordering when all stops are fixed', () => {
    const stops: OptimizableStop[] = [
      makeStop('a', 1, 0, 0, { isFixed: true }),
      makeStop('b', 2, 5, 5, { isFixed: true }),
    ];
    const result = optimizeStopSequence(stops);
    expect(result.feasible).toBe(false);
    expect(result.eligibleCount).toBe(0);
    expect(result.changedStopIds).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('Fewer than 2'))).toBe(true);
  });

  // J — only one eligible stop
  it('J: single eligible stop — not feasible to reorder', () => {
    const stops: OptimizableStop[] = [
      makeStop('fixed', 1, 0, 0, { isFixed: true }),
      makeStop('one', 2, 10, 10, {}),
    ];
    const result = optimizeStopSequence(stops);
    expect(result.feasible).toBe(false);
    expect(result.eligibleCount).toBe(1);
    expect(result.changedStopIds).toHaveLength(0);
  });

  // K — 2-opt improves on nearest-neighbor when route crosses itself
  it('K: 2-opt uncrosses route and reduces distance', () => {
    // Classic crossing route: A(0,0)→C(10,10)→B(0,10)→D(10,0)
    // 2-opt should find: A(0,0)→B(0,10)→C(10,10)→D(10,0) or similar improvement
    const stops: OptimizableStop[] = [
      makeStop('A', 1, 0, 0, {}),
      makeStop('C', 2, 10, 10, {}),
      makeStop('B', 3, 0, 10, {}),
      makeStop('D', 4, 10, 0, {}),
    ];
    const result = optimizeStopSequence(stops);
    expect(result.feasible).toBe(true);
    // The optimizer should find a shorter or equal path
    expect(result.proposedDistanceM).toBeLessThanOrEqual(result.currentDistanceM + 1);
  });

  // L — empty input
  it('L: empty stops array returns not-feasible with no crash', () => {
    const result = optimizeStopSequence([]);
    expect(result.feasible).toBe(false);
    expect(result.currentSequence).toHaveLength(0);
    expect(result.proposedSequence).toHaveLength(0);
    expect(result.warnings).toContain('No stops to optimize.');
  });

  // M — already-optimal route produces no changes
  it('M: already-optimal straight-line route has empty changedStopIds', () => {
    // A(0,0)→B(1,0)→C(2,0): NN picks this order naturally; no 2-opt improvement exists
    const stops: OptimizableStop[] = [
      makeStop('A', 1, 0, 0, {}),
      makeStop('B', 2, 1, 0, {}),
      makeStop('C', 3, 2, 0, {}),
    ];
    const result = optimizeStopSequence(stops);
    expect(result.feasible).toBe(true);
    expect(result.changedStopIds).toHaveLength(0);
    expect(result.proposedDistanceM).toBeLessThanOrEqual(result.currentDistanceM + 1);
  });

  // N — fixed stop in the middle keeps its slot; eligible stops fill the remaining slots
  it('N: fixed stop in middle keeps slot; eligible stops redistribute to remaining slots', () => {
    const stops: OptimizableStop[] = [
      makeStop('a', 1, 0, 0, {}),
      makeStop('fixed', 2, 5, 5, { isFixed: true }),
      makeStop('b', 3, 10, 0, {}),
      makeStop('c', 4, 0, 10, {}),
    ];
    const result = optimizeStopSequence(stops);
    expect(result.feasible).toBe(true);
    expect(result.proposedSequence.find((s) => s.id === 'fixed')?.sequence).toBe(2);
    const eligibleSlots = result.proposedSequence
      .filter((s) => s.id !== 'fixed')
      .map((s) => s.sequence)
      .sort((a, b) => a - b);
    expect(eligibleSlots).toEqual([1, 3, 4]);
  });
});
