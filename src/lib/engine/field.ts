/**
 * FieldEngine — composable vector force fields.
 *
 * A field is just a sum of sources (attract / repel / vortex / directional /
 * turbulence) sampled at a point. Effects don't hardcode "mouse repulsion" —
 * they add a mutable ForceSource for the mouse into the same list that holds
 * the center attractor, the noise turbulence, etc. This is what lets several
 * forces combine into emergent behavior instead of scripted motion.
 */

import { NoiseEngine } from "./noise";

export type ForceKind = "attract" | "repel" | "vortex" | "directional" | "turbulence";

export interface ForceSource {
  kind: ForceKind;
  x: number;
  y: number;
  strength: number;
  radius: number; // falloff radius in px
  falloff?: number; // exponent, higher = sharper cutoff (default 2)
  angle?: number; // for directional, radians
  scale?: number; // for turbulence, noise spatial scale
  speed?: number; // for turbulence, time scale
  enabled?: boolean;
}

function gaussianFalloff(dist: number, radius: number, falloff = 2): number {
  if (radius <= 0) return 0;
  const t = dist / radius;
  return Math.exp(-Math.pow(t, falloff) * 2.0);
}

export class FieldEngine {
  sources: ForceSource[] = [];
  noise: NoiseEngine;

  constructor(seed: number) {
    this.noise = new NoiseEngine(seed);
  }

  reseed(seed: number) {
    this.noise = new NoiseEngine(seed);
  }

  add(source: ForceSource) {
    this.sources.push(source);
    return source;
  }

  clear() {
    this.sources = [];
  }

  sample(x: number, y: number, t: number): { x: number; y: number } {
    let fx = 0, fy = 0;
    for (const s of this.sources) {
      if (s.enabled === false || s.strength === 0) continue;
      switch (s.kind) {
        case "attract":
        case "repel": {
          const dx = x - s.x, dy = y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const inf = gaussianFalloff(dist, s.radius, s.falloff) * s.strength;
          const sign = s.kind === "attract" ? -1 : 1;
          fx += sign * (dx / dist) * inf;
          fy += sign * (dy / dist) * inf;
          break;
        }
        case "vortex": {
          const dx = x - s.x, dy = y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const inf = gaussianFalloff(dist, s.radius, s.falloff) * s.strength;
          // tangential direction (perpendicular to radius)
          fx += (-dy / dist) * inf;
          fy += (dx / dist) * inf;
          break;
        }
        case "directional": {
          const a = s.angle ?? 0;
          fx += Math.cos(a) * s.strength;
          fy += Math.sin(a) * s.strength;
          break;
        }
        case "turbulence": {
          const scale = s.scale ?? 0.003;
          const speed = s.speed ?? 0.15;
          const c = this.noise.curl2(x * scale, y * scale, t * speed);
          fx += c.x * s.strength;
          fy += c.y * s.strength;
          break;
        }
      }
    }
    return { x: fx, y: fy };
  }
}

/** Simple critically-damped-ish spring integrator shared by strand/point sims. */
export function springStep(
  pos: number,
  vel: number,
  rest: number,
  spring: number,
  damping: number,
  extraForce: number,
  dt: number,
): [number, number] {
  const springForce = (rest - pos) * spring;
  const v = (vel + (springForce + extraForce) * dt) * damping;
  const p = pos + v * dt;
  return [p, v];
}
