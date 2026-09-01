/**
 * Source primitives — where new agents (particles, strand roots, grid seeds)
 * come from. Kept separate from Behavior so any spawn shape can be paired
 * with any field/behavior: a route can emit particles (spawnAlongPath) that
 * then get picked up by a curl-noise flow behavior, exactly like a "region"
 * spawn feeding a magnetic accelerate behavior.
 */

import { SeededRandom } from "./random";

export type SpawnRegion = "edges" | "ring" | "center" | "random" | "region";

export interface SpawnOptions {
  region: SpawnRegion;
  width: number;
  height: number;
  centerX?: number; // 0..1, defaults to canvas center
  centerY?: number;
  radius?: number; // px, for "ring"/"region"
  margin?: number; // px, for "edges"
}

export function spawnPoint(rng: SeededRandom, opts: SpawnOptions): { x: number; y: number } {
  const cx = (opts.centerX ?? 0.5) * opts.width;
  const cy = (opts.centerY ?? 0.5) * opts.height;
  switch (opts.region) {
    case "edges": {
      const margin = opts.margin ?? 40;
      const edge = rng.int(0, 3);
      if (edge === 0) return { x: -margin, y: rng.range(0, opts.height) };
      if (edge === 1) return { x: opts.width + margin, y: rng.range(0, opts.height) };
      if (edge === 2) return { x: rng.range(0, opts.width), y: -margin };
      return { x: rng.range(0, opts.width), y: opts.height + margin };
    }
    case "ring": {
      const r = opts.radius ?? Math.min(opts.width, opts.height) * 0.35;
      const a = rng.range(0, Math.PI * 2);
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    }
    case "center":
      return { x: cx + rng.gaussian() * 16, y: cy + rng.gaussian() * 16 };
    case "region": {
      const r = opts.radius ?? Math.min(opts.width, opts.height) * 0.25;
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * r;
      return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
    }
    case "random":
    default:
      return { x: rng.range(0, opts.width), y: rng.range(0, opts.height) };
  }
}

/** Interpolates a point along a polyline path at t (0..1) — this is what
 *  lets a route (or any path) emit particles: sample this, hand the point to
 *  a Behavior each frame. */
export function spawnAlongPath(path: { x: number; y: number }[], t: number): { x: number; y: number } {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1) return path[0];
  const scaled = Math.max(0, Math.min(1, t)) * (path.length - 1);
  const i0 = Math.floor(scaled), i1 = Math.min(path.length - 1, i0 + 1);
  const lt = scaled - i0;
  return { x: path[i0].x + (path[i1].x - path[i0].x) * lt, y: path[i0].y + (path[i1].y - path[i0].y) * lt };
}
