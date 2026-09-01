/**
 * Vortex Field — particles spiraling around one or more vortex centers, each
 * a vortex + a weak inward attractor stacked at the same point (a "spiral
 * sink"). Same Behavior (accelerate) as Magnetic Field, different Field
 * composition — the point being that swapping the field alone changes the
 * whole character of the piece.
 */

import { EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { FieldEngine, ForceSource } from "../engine/field";
import { behaviorAccelerate } from "../engine/behavior";
import { spawnPoint } from "../engine/source";
import { ensureContrast, mixOklch, oklchToCss, paletteSweep } from "../engine/color";
import { drawParticle, ParticleShape } from "../engine/particle";
import { SeededRandom } from "../engine/random";

export const vortexFieldParams: ParamField[] = [
  { key: "vortexCount", label: "Vortex Count", section: "Field", type: "slider", min: 1, max: 4, step: 1, default: 2, noMutate: true },
  { key: "spin", label: "Spin Strength", section: "Field", type: "slider", min: 0.2, max: 3, step: 0.02, default: 1.2 },
  { key: "inwardPull", label: "Inward Pull", section: "Field", type: "slider", min: 0, max: 1.5, step: 0.02, default: 0.35 },
  { key: "spread", label: "Vortex Spread", section: "Field", type: "slider", min: 0.1, max: 1, step: 0.01, default: 0.5 },
  { key: "turbulence", label: "Turbulence", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.08 },

  { key: "count", label: "Count", section: "Particles", type: "slider", min: 200, max: 8000, step: 50, default: 2400, noMutate: true },
  { key: "shape", label: "Shape", section: "Particles", type: "select", options: ["dot", "circle", "line"], default: "dot" },
  { key: "size", label: "Size", section: "Particles", type: "slider", min: 0.4, max: 6, step: 0.1, default: 1.6 },
  { key: "drag", label: "Drag", section: "Particles", type: "slider", min: 0, max: 0.15, step: 0.002, default: 0.02 },
  { key: "lifespan", label: "Lifespan", section: "Particles", type: "slider", min: 2, max: 16, step: 0.1, default: 7 },
  { key: "trailLength", label: "Trail Length", section: "Trails", type: "slider", min: 2, max: 40, step: 1, default: 20 },
  { key: "trailOpacity", label: "Trail Opacity", section: "Trails", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },

  { key: "mouseStrength", label: "Mouse Strength", section: "Interaction", type: "slider", min: 0, max: 3, step: 0.02, default: 0.8 },
  { key: "mouseRadius", label: "Influence Radius", section: "Interaction", type: "slider", min: 40, max: 700, step: 5, default: 240 },
];

export interface VortexFieldParams {
  vortexCount: number; spin: number; inwardPull: number; spread: number; turbulence: number;
  count: number; shape: string; size: number; drag: number; lifespan: number;
  trailLength: number; trailOpacity: number;
  mouseStrength: number; mouseRadius: number;
}

interface Particle { x: number; y: number; vx: number; vy: number; age: number; maxAge: number; sizeMul: number; trail: Float32Array; head: number; count: number; rng: SeededRandom }
interface VortexFieldState { particles: Particle[]; field: FieldEngine; centers: { x: number; y: number }[]; key: string }

function keyOf(p: VortexFieldParams, w: number, h: number) { return `${Math.round(p.count)}:${Math.round(p.vortexCount)}:${w}:${h}`; }

function buildCenters(n: number, w: number, h: number, rng: SeededRandom, spread: number): { x: number; y: number }[] {
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.28 * spread;
  const centers: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + rng.next() * 0.6;
    centers.push(n === 1 ? { x: cx, y: cy } : { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return centers;
}

function respawn(pt: Particle, centers: { x: number; y: number }[], w: number, h: number) {
  const c = centers[pt.rng.int(0, centers.length - 1)] ?? { x: w / 2, y: h / 2 };
  const p = spawnPoint(pt.rng, { region: "region", width: w, height: h, centerX: c.x / w, centerY: c.y / h, radius: Math.min(w, h) * 0.32 });
  pt.x = p.x; pt.y = p.y; pt.vx = 0; pt.vy = 0; pt.age = 0;
}

export const vortexFieldEffect: EffectDefinition<VortexFieldParams, VortexFieldState> = {
  id: "vortex-field",
  name: "Vortex Field",
  category: "FIELDS",
  description: "Particles spiraling into vortex sinks — a vortex and an attractor stacked at each center.",
  fields: vortexFieldParams,
  defaultParams: fieldDefaults<VortexFieldParams>(vortexFieldParams),
  focalPoint: () => ({ x: 0.5, y: 0.5 }),

  createState(params, ctx) {
    const rng = new SeededRandom(ctx.rng.seed);
    const centers = buildCenters(Math.round(params.vortexCount), ctx.width, ctx.height, rng, params.spread);
    const n = Math.round(params.count);
    const particles: Particle[] = [];
    for (let i = 0; i < n; i++) {
      const prng = rng.stream(i);
      const pt: Particle = { x: 0, y: 0, vx: 0, vy: 0, age: 0, maxAge: params.lifespan, sizeMul: 0.6 + prng.next() * 0.8, trail: new Float32Array(84), head: 0, count: 0, rng: prng };
      respawn(pt, centers, ctx.width, ctx.height);
      pt.age = prng.range(0, params.lifespan);
      particles.push(pt);
    }
    return { particles, field: new FieldEngine(ctx.rng.seed), centers, key: keyOf(params, ctx.width, ctx.height) };
  },

  update(state, params, ctx) {
    const k = keyOf(params, ctx.width, ctx.height);
    if (k !== state.key) {
      const rng = new SeededRandom(ctx.rng.seed);
      state.centers = buildCenters(Math.round(params.vortexCount), ctx.width, ctx.height, rng, params.spread);
      const n = Math.round(params.count);
      const arr: Particle[] = [];
      for (let i = 0; i < n; i++) {
        const existing = state.particles[i];
        if (existing) { arr.push(existing); continue; }
        const prng = new SeededRandom(ctx.rng.seed).stream(i);
        const pt: Particle = { x: 0, y: 0, vx: 0, vy: 0, age: 0, maxAge: params.lifespan, sizeMul: 0.6 + prng.next() * 0.8, trail: new Float32Array(84), head: 0, count: 0, rng: prng };
        respawn(pt, state.centers, ctx.width, ctx.height);
        arr.push(pt);
      }
      state.particles = arr;
      state.key = k;
    }

    const sources: ForceSource[] = [];
    for (const c of state.centers) {
      sources.push({ kind: "vortex", x: c.x, y: c.y, strength: params.spin * 700, radius: Math.hypot(ctx.width, ctx.height), falloff: 1.3 });
      sources.push({ kind: "attract", x: c.x, y: c.y, strength: params.inwardPull * 500, radius: Math.hypot(ctx.width, ctx.height), falloff: 1.6 });
    }
    sources.push({ kind: "turbulence", x: 0, y: 0, strength: params.turbulence * 260, radius: 0, scale: 0.002, speed: 0.1 });
    if (ctx.interactionEnabled && ctx.mouse.active) {
      sources.push({ kind: "repel", x: ctx.mouse.sx, y: ctx.mouse.sy, strength: params.mouseStrength * 900, radius: params.mouseRadius, falloff: 1.6 });
    }
    state.field.sources = sources;

    const w = ctx.width, h = ctx.height, margin = 60;
    for (const pt of state.particles) {
      pt.age += ctx.dt;
      if (pt.age > pt.maxAge || pt.x < -margin || pt.x > w + margin || pt.y < -margin || pt.y > h + margin) respawn(pt, state.centers, w, h);
      const f = state.field.sample(pt.x, pt.y, ctx.time);
      behaviorAccelerate(pt, f, ctx.dt, { accel: 0.02, drag: params.drag, maxSpeed: 5 });
      const len = pt.trail.length / 2;
      pt.head = (pt.head + 1) % len;
      pt.trail[pt.head * 2] = pt.x; pt.trail[pt.head * 2 + 1] = pt.y;
      pt.count = Math.min(len, pt.count + 1);
    }
  },

  render(state, params, ctx) {
    const { ctx: c } = ctx;
    const depthScale = ctx.depth === "off" ? 1 : ctx.depth === "subtle" ? 1.1 : 1.3;
    const trailLen = Math.max(2, Math.min(Math.round(params.trailLength), 40));

    for (const pt of state.particles) {
      const lifeFade = Math.min(1, pt.age / 0.3) * Math.min(1, (pt.maxAge - pt.age) / 0.6);
      const speed = Math.hypot(pt.vx, pt.vy);
      const colorT = Math.min(1, speed / 3);
      const color = ensureContrast(mixOklch(ctx.palette.ambient, paletteSweep(ctx.palette, 0.5 + colorT * 0.5), 0.7), ctx.palette.background, 0.3);
      const css = oklchToCss(color);

      const total = Math.min(trailLen, pt.count);
      if (total > 1 && params.trailOpacity > 0.01) {
        const bufLen = pt.trail.length / 2;
        c.strokeStyle = css; c.lineCap = "round";
        for (let i = 1; i < total; i++) {
          const ia = (pt.head - i + bufLen * 4) % bufLen, ib = (pt.head - i + 1 + bufLen * 4) % bufLen;
          const ax = pt.trail[ia * 2], ay = pt.trail[ia * 2 + 1], bx = pt.trail[ib * 2], by = pt.trail[ib * 2 + 1];
          if (Math.hypot(bx - ax, by - ay) > 100) continue;
          const a = params.trailOpacity * lifeFade * (1 - i / total);
          if (a < 0.01) continue;
          c.globalAlpha = a;
          c.lineWidth = Math.max(0.15, params.size * 0.5 * pt.sizeMul * depthScale);
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
        }
        c.globalAlpha = 1;
      }
      drawParticle(c, { x: pt.x, y: pt.y, size: params.size * pt.sizeMul * depthScale, opacity: lifeFade, color: css }, { shape: params.shape as ParticleShape });
    }
  },
};
