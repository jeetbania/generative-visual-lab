/**
 * Flow Field — particles as pure advection through a curl-noise flow (no
 * inertia, velocity IS the field), the laminar counterpart to Magnetic
 * Field's Newtonian particles. Demonstrates: FieldEngine -> behaviorFlow ->
 * particles that inherit the atmosphere's color underneath them.
 */

import { EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { FieldEngine, ForceSource } from "../engine/field";
import { behaviorFlow } from "../engine/behavior";
import { spawnPoint } from "../engine/source";
import { ensureContrast, mixOklch, oklchToCss } from "../engine/color";
import { drawParticle, ParticleShape } from "../engine/particle";
import { SeededRandom } from "../engine/random";

export const flowFieldParams: ParamField[] = [
  { key: "fieldScale", label: "Field Scale", section: "Field", type: "slider", min: 0.2, max: 4, step: 0.02, default: 1.1 },
  { key: "fieldSpeed", label: "Field Evolution", section: "Field", type: "slider", min: 0, max: 1, step: 0.005, default: 0.08 },
  { key: "flowStrength", label: "Flow Strength", section: "Field", type: "slider", min: 0.1, max: 3, step: 0.02, default: 1.2 },
  { key: "directionalBias", label: "Directional Bias", section: "Field", type: "slider", min: -180, max: 180, step: 1, default: 0 },
  { key: "biasStrength", label: "Bias Strength", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.15 },

  { key: "count", label: "Count", section: "Particles", type: "slider", min: 200, max: 10000, step: 50, default: 2600, noMutate: true },
  { key: "shape", label: "Shape", section: "Particles", type: "select", options: ["dot", "circle", "line"], default: "dot" },
  { key: "size", label: "Size", section: "Particles", type: "slider", min: 0.4, max: 6, step: 0.1, default: 1.4 },
  { key: "lifespan", label: "Lifespan", section: "Particles", type: "slider", min: 1, max: 12, step: 0.1, default: 4.5 },
  { key: "trailLength", label: "Trail Length", section: "Trails", type: "slider", min: 2, max: 40, step: 1, default: 16 },
  { key: "trailOpacity", label: "Trail Opacity", section: "Trails", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },

  { key: "mouseMode", label: "Mouse Mode", section: "Interaction", type: "select", options: ["repel", "attract", "vortex", "none"], default: "vortex" },
  { key: "mouseStrength", label: "Mouse Strength", section: "Interaction", type: "slider", min: 0, max: 3, step: 0.02, default: 0.9 },
  { key: "mouseRadius", label: "Influence Radius", section: "Interaction", type: "slider", min: 40, max: 700, step: 5, default: 280 },

  { key: "appearance", label: "Appearance", section: "Color", type: "select", options: ["inheritGradient", "role"], default: "inheritGradient" },
];

export interface FlowFieldParams {
  fieldScale: number; fieldSpeed: number; flowStrength: number; directionalBias: number; biasStrength: number;
  count: number; shape: string; size: number; lifespan: number;
  trailLength: number; trailOpacity: number;
  mouseMode: string; mouseStrength: number; mouseRadius: number;
  appearance: string;
}

interface Particle { x: number; y: number; vx: number; vy: number; age: number; maxAge: number; sizeMul: number; trail: Float32Array; head: number; count: number; rng: SeededRandom }
interface FlowFieldState { particles: Particle[]; field: FieldEngine; key: string }

function keyOf(p: FlowFieldParams, w: number, h: number) { return `${Math.round(p.count)}:${w}:${h}`; }

function respawn(pt: Particle, w: number, h: number) {
  const p = spawnPoint(pt.rng, { region: "random", width: w, height: h });
  pt.x = p.x; pt.y = p.y; pt.age = 0;
  pt.count = 0; pt.head = 0;
}

export const flowFieldEffect: EffectDefinition<FlowFieldParams, FlowFieldState> = {
  id: "flow-field",
  name: "Flow Field",
  category: "FIELDS",
  description: "Particles as pure advection through a curl-noise flow — laminar, silk-like motion.",
  fields: flowFieldParams,
  defaultParams: fieldDefaults<FlowFieldParams>(flowFieldParams),
  focalPoint: () => ({ x: 0.5, y: 0.5 }),

  createState(params, ctx) {
    const rng = new SeededRandom(ctx.rng.seed);
    const n = Math.round(params.count);
    const particles: Particle[] = [];
    for (let i = 0; i < n; i++) {
      const prng = rng.stream(i);
      const pt: Particle = { x: 0, y: 0, vx: 0, vy: 0, age: 0, maxAge: 1, sizeMul: 0.6 + prng.next() * 0.8, trail: new Float32Array(84), head: 0, count: 0, rng: prng };
      respawn(pt, ctx.width, ctx.height);
      pt.age = prng.range(0, params.lifespan);
      pt.maxAge = params.lifespan * (0.7 + prng.next() * 0.6);
      particles.push(pt);
    }
    return { particles, field: new FieldEngine(ctx.rng.seed), key: keyOf(params, ctx.width, ctx.height) };
  },

  update(state, params, ctx) {
    const k = keyOf(params, ctx.width, ctx.height);
    if (k !== state.key) {
      const n = Math.round(params.count);
      const rng = new SeededRandom(ctx.rng.seed);
      const arr: Particle[] = [];
      for (let i = 0; i < n; i++) {
        const existing = state.particles[i];
        if (existing) { arr.push(existing); continue; }
        const prng = rng.stream(i);
        const pt: Particle = { x: 0, y: 0, vx: 0, vy: 0, age: 0, maxAge: params.lifespan, sizeMul: 0.6 + prng.next() * 0.8, trail: new Float32Array(84), head: 0, count: 0, rng: prng };
        respawn(pt, ctx.width, ctx.height);
        arr.push(pt);
      }
      state.particles = arr;
      state.key = k;
    }

    const mouseActive = ctx.interactionEnabled && ctx.mouse.active && params.mouseMode !== "none";
    const mouseSource: ForceSource = {
      kind: params.mouseMode === "vortex" ? "vortex" : params.mouseMode === "attract" ? "attract" : "repel",
      x: ctx.mouse.sx, y: ctx.mouse.sy, strength: mouseActive ? params.mouseStrength * 700 : 0,
      radius: params.mouseRadius, falloff: 1.5,
    };
    const turbulence: ForceSource = { kind: "turbulence", x: 0, y: 0, strength: params.flowStrength * 340, radius: 0, scale: 0.0018 * params.fieldScale, speed: params.fieldSpeed };
    const directional: ForceSource = { kind: "directional", x: 0, y: 0, strength: params.biasStrength * 180, radius: 0, angle: (params.directionalBias * Math.PI) / 180 };
    state.field.sources = [turbulence, directional, mouseSource];

    const w = ctx.width, h = ctx.height, margin = 40;
    for (const pt of state.particles) {
      pt.age += ctx.dt;
      if (pt.age > pt.maxAge || pt.x < -margin || pt.x > w + margin || pt.y < -margin || pt.y > h + margin) {
        respawn(pt, w, h);
        pt.maxAge = params.lifespan * (0.7 + pt.rng.next() * 0.6);
      }
      const f = state.field.sample(pt.x, pt.y, ctx.time);
      behaviorFlow(pt, f, ctx.dt, 0.16);
      const len = pt.trail.length / 2;
      pt.head = (pt.head + 1) % len;
      pt.trail[pt.head * 2] = pt.x; pt.trail[pt.head * 2 + 1] = pt.y;
      pt.count = Math.min(len, pt.count + 1);
    }
  },

  render(state, params, ctx) {
    const { ctx: c, width: w, height: h } = ctx;
    const depthScale = ctx.depth === "off" ? 1 : ctx.depth === "subtle" ? 1.1 : 1.3;
    const trailLen = Math.max(2, Math.min(Math.round(params.trailLength), 40));

    for (const pt of state.particles) {
      const lifeFade = Math.min(1, pt.age / 0.3) * Math.min(1, (pt.maxAge - pt.age) / 0.5);
      let color;
      if (params.appearance === "inheritGradient" && ctx.sampleAtmosphere) {
        color = ensureContrast(ctx.sampleAtmosphere(pt.x / w, pt.y / h), ctx.palette.background, 0.3);
      } else {
        color = ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.focal, 0.4), ctx.palette.background, 0.3);
      }
      const css = oklchToCss(color);
      const total = Math.min(trailLen, pt.count);
      if (total > 1 && params.trailOpacity > 0.01) {
        const bufLen = pt.trail.length / 2;
        c.strokeStyle = css;
        c.lineCap = "round";
        for (let i = 1; i < total; i++) {
          const ia = (pt.head - i + bufLen * 4) % bufLen, ib = (pt.head - i + 1 + bufLen * 4) % bufLen;
          const ax = pt.trail[ia * 2], ay = pt.trail[ia * 2 + 1], bx = pt.trail[ib * 2], by = pt.trail[ib * 2 + 1];
          if (Math.hypot(bx - ax, by - ay) > 80) continue;
          const a = params.trailOpacity * lifeFade * (1 - i / total);
          if (a < 0.01) continue;
          c.globalAlpha = a;
          c.lineWidth = Math.max(0.15, params.size * 0.5 * pt.sizeMul * depthScale * (1 - i / total));
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
        }
        c.globalAlpha = 1;
      }
      drawParticle(c, { x: pt.x, y: pt.y, size: params.size * pt.sizeMul * depthScale, opacity: lifeFade, color: css }, { shape: params.shape as ParticleShape });
    }
  },
};
