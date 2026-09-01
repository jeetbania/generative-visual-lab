/**
 * Magnetic Field — particles flowing through a real vector field composed of
 * point charges (dipole / multi-attractor / vortex), plus curl-noise
 * turbulence and a live mouse pole. Each particle carries a short fading
 * trail so the field's structure becomes visible, the way iron filings
 * reveal a magnet's lines of force.
 */

import { EffectContext, EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { FieldEngine, ForceSource } from "../engine/field";
import { ensureContrast, mixOklch, oklchToCss, oklchWithAlpha } from "../engine/color";
import { drawParticle, ParticleShape } from "../engine/particle";
import { SeededRandom } from "../engine/random";

export const magneticFieldParams: ParamField[] = [
  { key: "fieldType", label: "Field Type", section: "Field", type: "select", options: ["dipole", "radial", "vortex", "multi-attractor", "quadrupole"], default: "dipole" },
  { key: "fieldStrength", label: "Field Strength", section: "Field", type: "slider", min: 0, max: 3, step: 0.02, default: 1.2 },
  { key: "fieldScale", label: "Field Scale", section: "Field", type: "slider", min: 0.3, max: 2, step: 0.02, default: 1 },
  { key: "poleCount", label: "Pole Count", section: "Field", type: "slider", min: 2, max: 8, step: 1, default: 3, noMutate: true },
  { key: "turbulence", label: "Turbulence", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.18 },
  { key: "turbulenceScale", label: "Turbulence Scale", section: "Field", type: "slider", min: 0.1, max: 5, step: 0.05, default: 1 },

  { key: "count", label: "Count", section: "Particles", type: "slider", min: 100, max: 8000, step: 50, default: 1800, noMutate: true },
  { key: "shape", label: "Shape", section: "Particles", type: "select", options: ["dot", "circle", "plus", "cross", "diamond"], default: "dot" },
  { key: "size", label: "Size", section: "Particles", type: "slider", min: 0.5, max: 8, step: 0.1, default: 1.6 },
  { key: "sizeRandomness", label: "Size Randomness", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: "speed", label: "Max Speed", section: "Particles", type: "slider", min: 0.2, max: 6, step: 0.05, default: 2.2 },
  { key: "drag", label: "Drag", section: "Particles", type: "slider", min: 0, max: 0.2, step: 0.002, default: 0.035 },
  { key: "lifespan", label: "Lifespan", section: "Particles", type: "slider", min: 1, max: 14, step: 0.1, default: 5.5 },
  { key: "lifespanRandomness", label: "Lifespan Randomness", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "spawnRegion", label: "Spawn Region", section: "Particles", type: "select", options: ["edges", "ring", "random", "center"], default: "ring" },

  { key: "trailLength", label: "Trail Length", section: "Trails", type: "slider", min: 0, max: 40, step: 1, default: 14 },
  { key: "trailOpacity", label: "Trail Opacity", section: "Trails", type: "slider", min: 0, max: 1, step: 0.01, default: 0.55 },
  { key: "trailThickness", label: "Trail Thickness", section: "Trails", type: "slider", min: 0.2, max: 3, step: 0.05, default: 0.8 },

  { key: "mouseMode", label: "Mouse Mode", section: "Interaction", type: "select", options: ["repel", "attract", "vortex", "none"], default: "attract" },
  { key: "mouseStrength", label: "Mouse Strength", section: "Interaction", type: "slider", min: 0, max: 3, step: 0.02, default: 1 },
  { key: "mouseRadius", label: "Influence Radius", section: "Interaction", type: "slider", min: 40, max: 700, step: 5, default: 260 },

  { key: "colorBy", label: "Color By", section: "Color", type: "select", options: ["speed", "lifetime", "angle", "mono"], default: "speed" },
  { key: "brightnessVariance", label: "Brightness Variance", section: "Color", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "appearance", label: "Appearance", section: "Color", type: "select", options: ["role", "inheritGradient"], default: "role" },
];

export interface MagneticFieldParams {
  fieldType: string; fieldStrength: number; fieldScale: number; poleCount: number;
  turbulence: number; turbulenceScale: number;
  count: number; shape: string; size: number; sizeRandomness: number;
  speed: number; drag: number; lifespan: number; lifespanRandomness: number; spawnRegion: string;
  trailLength: number; trailOpacity: number; trailThickness: number;
  mouseMode: string; mouseStrength: number; mouseRadius: number;
  colorBy: string; brightnessVariance: number; appearance: string;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  age: number; maxAge: number; size: number; speedBias: number;
  trail: Float32Array; trailHead: number; trailCount: number;
  rng: SeededRandom;
}

interface MagneticFieldState {
  particles: Particle[];
  field: FieldEngine;
  poles: ForceSource[];
  key: string;
}

function keyOf(p: MagneticFieldParams, w: number, h: number) {
  return JSON.stringify([p.fieldType, p.fieldScale, p.poleCount, w, h, p.count, p.trailLength]);
}

function buildPoles(p: MagneticFieldParams, w: number, h: number, rng: SeededRandom): ForceSource[] {
  const cx = w / 2, cy = h / 2;
  const R = Math.hypot(w, h);
  const bigRadius = R * 1.1;
  const sep = Math.min(w, h) * 0.32 * p.fieldScale;
  const strength = p.fieldStrength * 900;
  switch (p.fieldType) {
    case "dipole":
      return [
        { kind: "attract", x: cx - sep / 2, y: cy, strength, radius: bigRadius, falloff: 1.4 },
        { kind: "repel", x: cx + sep / 2, y: cy, strength, radius: bigRadius, falloff: 1.4 },
      ];
    case "radial":
      return [{ kind: "repel", x: cx, y: cy, strength, radius: bigRadius, falloff: 1.2 }];
    case "vortex":
      return [{ kind: "vortex", x: cx, y: cy, strength, radius: bigRadius, falloff: 1.2 }];
    case "quadrupole": {
      const d = sep * 0.6;
      return [
        { kind: "attract", x: cx - d, y: cy - d, strength, radius: bigRadius, falloff: 1.6 },
        { kind: "repel", x: cx + d, y: cy - d, strength, radius: bigRadius, falloff: 1.6 },
        { kind: "attract", x: cx + d, y: cy + d, strength, radius: bigRadius, falloff: 1.6 },
        { kind: "repel", x: cx - d, y: cy + d, strength, radius: bigRadius, falloff: 1.6 },
      ];
    }
    case "multi-attractor":
    default: {
      const arr: ForceSource[] = [];
      const n = Math.round(p.poleCount);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.next();
        const r = Math.min(w, h) * 0.3 * p.fieldScale;
        arr.push({
          kind: rng.chance(0.5) ? "attract" : "repel",
          x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r,
          strength: strength * rng.range(0.6, 1.1), radius: bigRadius, falloff: 1.5,
        });
      }
      return arr;
    }
  }
}

function respawn(pt: Particle, p: MagneticFieldParams, w: number, h: number) {
  const rng = pt.rng;
  const margin = 40;
  switch (p.spawnRegion) {
    case "edges": {
      const edge = rng.int(0, 3);
      if (edge === 0) { pt.x = -margin; pt.y = rng.range(0, h); }
      else if (edge === 1) { pt.x = w + margin; pt.y = rng.range(0, h); }
      else if (edge === 2) { pt.x = rng.range(0, w); pt.y = -margin; }
      else { pt.x = rng.range(0, w); pt.y = h + margin; }
      break;
    }
    case "ring": {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.min(w, h) * rng.range(0.28, 0.42);
      pt.x = w / 2 + Math.cos(a) * r; pt.y = h / 2 + Math.sin(a) * r;
      break;
    }
    case "center": {
      pt.x = w / 2 + rng.gaussian() * 20; pt.y = h / 2 + rng.gaussian() * 20;
      break;
    }
    case "random":
    default:
      pt.x = rng.range(0, w); pt.y = rng.range(0, h);
  }
  const a0 = rng.range(0, Math.PI * 2);
  const v0 = rng.range(0.1, 0.4);
  pt.vx = Math.cos(a0) * v0; pt.vy = Math.sin(a0) * v0;
  pt.age = 0;
  pt.maxAge = p.lifespan * (1 + rng.gaussian() * p.lifespanRandomness * 0.5);
  pt.size = 1 + rng.gaussian() * p.sizeRandomness * 0.6;
  pt.speedBias = 0.6 + rng.next() * 0.8;
  pt.trailCount = 0;
  pt.trailHead = 0;
}

export const magneticFieldEffect: EffectDefinition<MagneticFieldParams, MagneticFieldState> = {
  id: "magnetic-field",
  name: "Magnetic Field",
  category: "FIELDS",
  description: "Particles tracing the flow lines of composed point-charge and vortex fields.",
  fields: magneticFieldParams,
  defaultParams: fieldDefaults<MagneticFieldParams>(magneticFieldParams),
  focalPoint: () => ({ x: 0.5, y: 0.5 }),

  createState(params, ctx) {
    const rng = new SeededRandom(ctx.rng.seed);
    const field = new FieldEngine(ctx.rng.seed);
    const poles = buildPoles(params, ctx.width, ctx.height, rng);
    const particles: Particle[] = [];
    const n = Math.round(params.count);
    for (let i = 0; i < n; i++) {
      const prng = rng.stream(i);
      const trailLen = 41;
      const pt: Particle = {
        x: 0, y: 0, vx: 0, vy: 0, age: 0, maxAge: 1, size: 1, speedBias: 1,
        trail: new Float32Array(trailLen * 2), trailHead: 0, trailCount: 0, rng: prng,
      };
      respawn(pt, params, ctx.width, ctx.height);
      pt.age = prng.range(0, pt.maxAge); // desync lifecycles
      particles.push(pt);
    }
    return { particles, field, poles, key: keyOf(params, ctx.width, ctx.height) };
  },

  update(state, params, ctx) {
    const k = keyOf(params, ctx.width, ctx.height);
    if (k !== state.key) {
      const rng = new SeededRandom(ctx.rng.seed);
      state.poles = buildPoles(params, ctx.width, ctx.height, rng);
      const n = Math.round(params.count);
      if (state.particles.length !== n) {
        const arr: Particle[] = [];
        for (let i = 0; i < n; i++) {
          const existing = state.particles[i];
          if (existing) { arr.push(existing); continue; }
          const prng = new SeededRandom(ctx.rng.seed).stream(i);
          const pt: Particle = { x: 0, y: 0, vx: 0, vy: 0, age: 0, maxAge: 1, size: 1, speedBias: 1, trail: new Float32Array(82), trailHead: 0, trailCount: 0, rng: prng };
          respawn(pt, params, ctx.width, ctx.height);
          arr.push(pt);
        }
        state.particles = arr;
      }
      state.key = k;
    }

    const mouseActive = ctx.interactionEnabled && ctx.mouse.active && params.mouseMode !== "none";
    const mouseSource: ForceSource = {
      kind: params.mouseMode === "vortex" ? "vortex" : params.mouseMode === "attract" ? "attract" : "repel",
      x: ctx.mouse.sx, y: ctx.mouse.sy,
      strength: mouseActive ? params.mouseStrength * 1100 : 0,
      radius: params.mouseRadius,
      falloff: 1.6,
    };
    const turbulenceSource: ForceSource = {
      kind: "turbulence", x: 0, y: 0,
      strength: params.turbulence * 260, radius: 0,
      scale: 0.0025 * params.turbulenceScale, speed: 0.12,
    };
    state.field.sources = [...state.poles, mouseSource, turbulenceSource];

    const dt = Math.min(0.05, ctx.dt) * 60;
    const w = ctx.width, h = ctx.height, margin = 60;
    for (const pt of state.particles) {
      pt.age += ctx.dt;
      if (pt.age > pt.maxAge || pt.x < -margin || pt.x > w + margin || pt.y < -margin || pt.y > h + margin) {
        respawn(pt, params, w, h);
      }
      const f = state.field.sample(pt.x, pt.y, ctx.time);
      pt.vx = (pt.vx + f.x * 0.00006 * dt) * (1 - params.drag);
      pt.vy = (pt.vy + f.y * 0.00006 * dt) * (1 - params.drag);
      const maxSpd = params.speed * pt.speedBias;
      const spd = Math.hypot(pt.vx, pt.vy);
      if (spd > maxSpd) { pt.vx = (pt.vx / spd) * maxSpd; pt.vy = (pt.vy / spd) * maxSpd; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;

      const trailLen = pt.trail.length / 2;
      pt.trailHead = (pt.trailHead + 1) % trailLen;
      pt.trail[pt.trailHead * 2] = pt.x;
      pt.trail[pt.trailHead * 2 + 1] = pt.y;
      pt.trailCount = Math.min(trailLen, pt.trailCount + 1);
    }
  },

  render(state, params, ctx) {
    const { ctx: c } = ctx;
    const depthScale = ctx.depth === "off" ? 1 : ctx.depth === "subtle" ? 1.1 : 1.3;
    const trailLen = Math.max(2, Math.min(Math.round(params.trailLength), 40));

    for (const pt of state.particles) {
      const lifeT = pt.age / pt.maxAge;
      const fadeIn = Math.min(1, pt.age / 0.4);
      const fadeOut = Math.min(1, (pt.maxAge - pt.age) / 0.6);
      const lifeFade = Math.max(0, Math.min(1, fadeIn * fadeOut));
      const speed = Math.hypot(pt.vx, pt.vy) / Math.max(0.01, params.speed);

      let colorT: number;
      if (params.colorBy === "speed") colorT = Math.min(1, speed);
      else if (params.colorBy === "lifetime") colorT = 1 - lifeT;
      else if (params.colorBy === "angle") colorT = (Math.atan2(pt.vy, pt.vx) + Math.PI) / (Math.PI * 2);
      else colorT = 0.5;

      const brightness = 1 - params.brightnessVariance * 0.5 + params.brightnessVariance * colorT;
      let baseColor;
      if (params.appearance === "inheritGradient" && ctx.sampleAtmosphere) {
        // Composability demo: instead of a role-based palette color, sample
        // the SAME atmosphere the background painted, right at this
        // particle's position — particles literally pick up the color of
        // the gradient underneath them as they move through it.
        const under = ctx.sampleAtmosphere(pt.x / ctx.width, pt.y / ctx.height);
        baseColor = ensureContrast(mixOklch(under, ctx.palette.accent, 0.25 + colorT * 0.3), ctx.palette.background, 0.3);
      } else {
        // Foreground ink: rooted in `accent` (contrast-aware) and hue-shaded by
        // atmosphere/focal, rather than using those atmospheric tones directly —
        // they're calibrated to sit close to the background for a soft glow.
        const hueSource = mixOklch(ctx.palette.atmosphere, ctx.palette.focal, Math.min(1, colorT * 1.1));
        baseColor = ensureContrast(mixOklch(ctx.palette.accent, hueSource, 0.55), ctx.palette.background, 0.28);
      }
      const headColor = ensureContrast(mixOklch(baseColor, ctx.palette.accent, 0.5), ctx.palette.background, 0.34);

      // trail
      const total = Math.min(trailLen, pt.trailCount);
      if (total > 1 && params.trailOpacity > 0.01) {
        const trailLenBuf = pt.trail.length / 2;
        c.lineCap = "round";
        c.strokeStyle = oklchToCss(oklchWithAlpha(baseColor, 1));
        for (let i = 1; i < total; i++) {
          const idxA = (pt.trailHead - i + trailLenBuf * 4) % trailLenBuf;
          const idxB = (pt.trailHead - i + 1 + trailLenBuf * 4) % trailLenBuf;
          const ax = pt.trail[idxA * 2], ay = pt.trail[idxA * 2 + 1];
          const bx = pt.trail[idxB * 2], by = pt.trail[idxB * 2 + 1];
          if (Math.hypot(bx - ax, by - ay) > 60) continue; // wrapped/respawned, skip seam
          const segAlpha = params.trailOpacity * lifeFade * (1 - i / total) * brightness;
          if (segAlpha < 0.01) continue;
          c.globalAlpha = segAlpha;
          c.lineWidth = Math.max(0.15, params.trailThickness * (1 - i / total) * depthScale);
          c.beginPath();
          c.moveTo(ax, ay);
          c.lineTo(bx, by);
          c.stroke();
        }
        c.globalAlpha = 1;
      }

      // head
      const size = Math.max(0.3, params.size * pt.size * depthScale);
      drawParticle(c, {
        x: pt.x, y: pt.y, size,
        opacity: lifeFade * (0.7 + brightness * 0.3),
        color: oklchToCss(headColor),
      }, { shape: params.shape as ParticleShape });
    }
  },
};
