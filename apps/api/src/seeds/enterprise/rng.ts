/** Mulberry32 — deterministic PRNG for reproducible seeds. */
export function createRng(seed: number) {
  let t = seed >>> 0;

  const next = (): number => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1));

  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(next() * items.length)];
    if (item === undefined) {
      throw new Error("Cannot pick from an empty array");
    }
    return item;
  };

  const bool = (p = 0.5): boolean => next() < p;

  return { next, int, pick, bool };
}

export type Rng = ReturnType<typeof createRng>;
