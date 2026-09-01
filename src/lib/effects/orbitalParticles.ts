/**
 * Orbital Particles — layered rings of particles orbiting 1-3 centers at
 * varying radius/speed (an orrery), with the field able to perturb each
 * orbit's radius and speed rather than replace the motion outright.
 */

import { EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { FieldEngine, ForceSource } from "../engine/field";
import { behaviorOrbit } from "../engine/behavior";
import { ensureContrast, mixOklch, oklchToCss, paletteSweep } from "../engine/color";
import { drawParticle, ParticleShape } from "../engine/particle";
import { SeededRandom } from "../engine/random";

export const orbitalParticlesParams: ParamField[] = [
  { key: "centerCount", label: "Centers", section: "Field", type: "slider", min: 1, max: 3, step: 1, default: 1, noMutate: true },
  { key: "spread", label: "Center Spread", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.3 },
  { key: "orbitSpeed", label: "Orbit Speed", section: "Field", type: "slider", min: -3, max: 3, step: 0.02, default: 0.6 },
  { key: "speedByRadius", label: "Speed Decays w/ Radius", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: "turbulence", label: "Turbulence", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.1 },
  { key: "ringCount", label: "Ring Count", section: "Field", type: "slider", min: 2, max: 14, step: 1, default: 7, noMutate: true },

  { key: "particlesPerRing", label: "Particles / Ring", section: "Particles", type: "slider", min: 2, max: 200, step: 1, default: 48, noMutate: true },
  { key: "shape", label: "Shape", section: "Particles", type: "select", options: ["dot", "circle", "diamond"], default: "dot" },
  { key: "size", label: "Size", section: "Particles", type: "slider", min: 0.4, max: 6, step: 0.1, default: 1.8 },
  { key: "sizeRandomness", label: "Size Randomness", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.4 },
  { key: "opacity", label: "Opacity", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.85 },

  { key: "mouseStrength", label: "Mouse Strength", section: "Interaction", type: "slider", min: 0, max: 3, step: 0.02, default: 0.6 },
  { key: "mouseRadius", label: "Influence Radius", section: "Interaction", type: "slider", min: 40, max: 700, step: 5, default: 220 },
];

export interface OrbitalParticlesParams {
  centerCount: number; spread: number; orbitSpeed: number; speedByRadius: number; turbulence: number; ringCount: number;
  particlesPerRing: number; shape: string; size: number; sizeRandomness: number; opacity: number;
  mouseStrength: number; mouseRadius: number;
}

interface Orbiter { x: number; y: number; angle: number; radius: number; baseRadius: number; centerIdx: number; speedMul: number; sizeMul: number; ringT: number }
interface OrbitalParticlesState { orbiters: Orbiter[]; field: FieldEngine; centers: { x: number; y: number }[]; key: string }

function keyOf(p: OrbitalParticlesParams, w: number, h: number) {
  return `${Math.round(p.centerCount)}:${Math.round(p.ringCount)}:${Math.round(p.particlesPerRing)}:${w}:${h}`;
}

function buildCenters(n: number, w: number, h: number, spread: number): { x: number; y: number }[] {
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.3 * spread;
  if (n === 1) return [{ x: cx, y: cy }];
  const centers: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    centers.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return centers;
}

export const orbitalParticlesEffect: EffectDefinition<OrbitalParticlesParams, OrbitalParticlesState> = {
  id: "orbital-particles",
  name: "Orbital Particles",
  category: "PARTICLES",
  description: "Layered rings of particles orbiting one to three centers, an orrery perturbed by a live field.",
  fields: orbitalParticlesParams,
  defaultParams: fieldDefaults<OrbitalParticlesParams>(orbitalParticlesParams),
  focalPoint: () => ({ x: 0.5, y: 0.5 }),

  createState(params, ctx) {
    const rng = new SeededRandom(ctx.rng.seed);
    const centers = buildCenters(Math.round(params.centerCount), ctx.width, ctx.height, params.spread);
    const rings = Math.round(params.ringCount), perRing = Math.round(params.particlesPerRing);
    const maxR = Math.min(ctx.width, ctx.height) * 0.44;
    const orbiters: Orbiter[] = [];
    for (let r = 0; r < rings; r++) {
      const radius = maxR * ((r + 1) / rings);
      for (let i = 0; i < perRing; i++) {
        const prng = rng.stream(r * 1000 + i);
        const angle = (i / perRing) * Math.PI * 2 + prng.next() * 0.2;
        const centerIdx = Math.floor(prng.next() * centers.length);
        orbiters.push({ x: 0, y: 0, angle, radius, baseRadius: radius, centerIdx, speedMul: prng.range(0.85, 1.15), sizeMul: 1 + prng.gaussian() * params.sizeRandomness * 0.5, ringT: r / Math.max(1, rings - 1) });
      }
    }
    return { orbiters, field: new FieldEngine(ctx.rng.seed), centers, key: keyOf(params, ctx.width, ctx.height) };
  },

  update(state, params, ctx) {
    const k = keyOf(params, ctx.width, ctx.height);
    if (k !== state.key) {
      const rng = new SeededRandom(ctx.rng.seed);
      state.centers = buildCenters(Math.round(params.centerCount), ctx.width, ctx.height, params.spread);
      const rings = Math.round(params.ringCount), perRing = Math.round(params.particlesPerRing);
      const maxR = Math.min(ctx.width, ctx.height) * 0.44;
      const orbiters: Orbiter[] = [];
      for (let r = 0; r < rings; r++) {
        const radius = maxR * ((r + 1) / rings);
        for (let i = 0; i < perRing; i++) {
          const prng = rng.stream(r * 1000 + i);
          const angle = (i / perRing) * Math.PI * 2 + prng.next() * 0.2;
          const centerIdx = Math.floor(prng.next() * state.centers.length);
          orbiters.push({ x: 0, y: 0, angle, radius, baseRadius: radius, centerIdx, speedMul: prng.range(0.85, 1.15), sizeMul: 1 + prng.gaussian() * params.sizeRandomness * 0.5, ringT: r / Math.max(1, rings - 1) });
        }
      }
      state.orbiters = orbiters;
      state.key = k;
    }

    const sources: ForceSource[] = [{ kind: "turbulence", x: 0, y: 0, strength: params.turbulence * 160, radius: 0, scale: 0.0025, speed: 0.08 }];
    if (ctx.interactionEnabled && ctx.mouse.active) {
      sources.push({ kind: "repel", x: ctx.mouse.sx, y: ctx.mouse.sy, strength: params.mouseStrength * 700, radius: params.mouseRadius, falloff: 1.8 });
    }
    state.field.sources = sources;

    for (const o of state.orbiters) {
      const c = state.centers[o.centerIdx] ?? state.centers[0];
      const radiusFalloff = 1 - params.speedByRadius * Math.min(1, o.radius / (Math.min(ctx.width, ctx.height) * 0.5)) * 0.7;
      const angularSpeed = params.orbitSpeed * o.speedMul * radiusFalloff;
      const f = state.field.sample(o.x, o.y, ctx.time);
      behaviorOrbit(o, c, o.baseRadius, angularSpeed, ctx.dt, f, 0.03);
    }
  },

  render(state, params, ctx) {
    const { ctx: c } = ctx;
    const depthScale = ctx.depth === "off" ? 1 : ctx.depth === "subtle" ? 1.1 : 1.3;
    for (const o of state.orbiters) {
      const color = ensureContrast(paletteSweep(ctx.palette, o.ringT), ctx.palette.background, 0.28);
      drawParticle(c, {
        x: o.x, y: o.y, size: params.size * o.sizeMul * depthScale,
        opacity: params.opacity, color: oklchToCss(mixOklch(color, ctx.palette.accent, 0.25)),
      }, { shape: params.shape as ParticleShape });
    }
  },
};
