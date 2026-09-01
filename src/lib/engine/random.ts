/**
 * RandomEngine — deterministic seeded randomness.
 *
 * Every generator in the lab is driven by a numeric seed so a composition can
 * be reproduced exactly. `mutate()` deliberately does NOT reseed the whole
 * system — it nudges a fraction of the derived random stream so the result
 * is recognizably related to its parent rather than a fresh roll.
 */

export function hashStringToSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 — fast, tiny, good-enough statistical quality for visuals. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

export class SeededRandom {
  seed: number;
  private rng: () => number;
  /** monotonically-increasing call counter, used to derive independent sub-streams */
  private calls = 0;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
  }

  reset(seed?: number) {
    if (seed !== undefined) this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.calls = 0;
  }

  /** Independent, stable stream for a given integer index (e.g. particle id). */
  stream(index: number): SeededRandom {
    return new SeededRandom((this.seed ^ Math.imul(index + 1, 2654435761)) >>> 0);
  }

  next(): number {
    this.calls++;
    return this.rng();
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Box-Muller, roughly N(0,1) truncated to [-3,3]. */
  gaussian(): number {
    const u1 = Math.max(this.next(), 1e-9);
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(-3, Math.min(3, z));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1;
  }
}

/**
 * Perturbs a flat numeric parameter bag by `amount` (0..1 = 0%..100%) of each
 * field's declared range, using a *different* seed derived from the parent so
 * repeated mutations of the same seed diverge, while staying close to the
 * original values. Non-numeric fields pass through untouched.
 */
export function mutateNumericParams<T extends Record<string, unknown>>(
  params: T,
  ranges: Partial<Record<keyof T, [number, number]>>,
  amount: number,
  rng: SeededRandom,
): T {
  const out: Record<string, unknown> = { ...params };
  for (const key in ranges) {
    const range = ranges[key];
    if (!range) continue;
    const [min, max] = range;
    const span = max - min;
    const current = Number(params[key]);
    if (Number.isNaN(current)) continue;
    const delta = rng.gaussian() * amount * span * 0.5;
    out[key as string] = Math.min(max, Math.max(min, current + delta));
  }
  return out as T;
}
