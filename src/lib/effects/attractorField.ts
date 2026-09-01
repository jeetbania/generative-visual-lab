/**
 * Attractor Field — several point attractors compete for a swarm of
 * particles, and the ATMOSPHERE'S GLOW FOLLOWS WHICHEVER ATTRACTOR THE MOUSE
 * IS NEAREST. This is the "a gradient should be able to follow an attractor"
 * primitive made concrete: `focalPoint` reads live state, not just params.
 */

import { EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { FieldEngine, ForceSource } from "../engine/field";
import { behaviorAccelerate } from "../engine/behavior";
import { spawnPoint } from "../engine/source";
import { ensureContrast, mixOklch, oklchToCss } from "../engine/color";
import { drawParticle, ParticleShape } from "../engine/particle";
import { SeededRandom } from "../engine/random";

export const attractorFieldParams: ParamField[] = [
  { key: "attractorCount", label: "Attractor Count", section: "Field", type: "slider", min: 2, max: 6, step: 1, default: 3, noMutate: true },
  { key: "strength", label: "Attraction Strength", section: "Field", type: "slider", min: 0.2, max: 3, step: 0.02, default: 1 },
  { key: "spread", label: "Spread", section: "Field", type: "slider", min: 0.15, max: 1, step: 0.01, default: 0.55 },
  { key: "wander", label: "Attractor Wander", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.3 },
  { key: "turbulence", label: "Turbulence", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.1 },
  { key: "followMouse", label: "Glow Follows Nearest", section: "Field", type: "toggle", default: true },

  { key: "count", label: "Count", section: "Particles", type: "slider", min: 200, max: 8000, step: 50, default: 2800, noMutate: true },
  { key: "shape", label: "Shape", section: "Particles", type: "select", options: ["dot", "circle", "diamond"], default: "dot" },
  { key: "size", label: "Size", section: "Particles", type: "slider", min: 0.4, max: 6, step: 0.1, default: 1.7 },
  { key: "drag", label: "Drag", section: "Particles", type: "slider", min: 0, max: 0.15, step: 0.002, default: 0.03 },
  { key: "lifespan", label: "Lifespan", section: "Particles", type: "slider", min: 2, max: 16, step: 0.1, default: 6 },
  { key: "trailOpacity", label: "Trail Opacity", section: "Trails", type: "slider", min: 0, max: 1, step: 0.01, default: 0.4 },
];

export interface AttractorFieldParams {
  attractorCount: number; strength: number; spread: number; wander: number; turbulence: number; followMouse: boolean;
  count: number; shape: string; size: number; drag: number; lifespan: number; trailOpacity: number;
}

interface Particle { x: number; y: number; vx: number; vy: number; age: number; maxAge: number; sizeMul: number; prevX: number; prevY: number; rng: SeededRandom }
interface AttractorFieldState {
  particles: Particle[]; field: FieldEngine; baseCenters: { x: number; y: number }[];
  liveCenters: { x: number; y: number }[]; focal: { x: number; y: number }; key: string;
}

function keyOf(p: AttractorFieldParams, w: number, h: number) { return `${Math.round(p.count)}:${Math.round(p.attractorCount)}:${w}:${h}`; }

function buildCenters(n: number, w: number, h: number, rng: SeededRandom, spread: number) {
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.32 * spread;
  const centers: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.next();
    centers.push({ x: cx + Math.cos(a) * r * rng.range(0.7, 1), y: cy + Math.sin(a) * r * rng.range(0.7, 1) });
  }
  return centers;
}

function respawn(pt: Particle, w: number, h: number) {
  const p = spawnPoint(pt.rng, { region: "random", width: w, height: h });
  pt.x = p.x; pt.y = p.y; pt.vx = 0; pt.vy = 0; pt.age = 0; pt.prevX = p.x; pt.prevY = p.y;
}

export const attractorFieldEffect: EffectDefinition<AttractorFieldParams, AttractorFieldState> = {
  id: "attractor-field",
  name: "Attractor Field",
  category: "FIELDS",
  description: "Particles pulled between competing attractors; the atmosphere's glow follows whichever the cursor favors.",
  fields: attractorFieldParams,
  defaultParams: fieldDefaults<AttractorFieldParams>(attractorFieldParams),
  focalPoint: (params, state) => {
    if (!state) return { x: 0.5, y: 0.5 };
    return { x: state.focal.x, y: state.focal.y };
  },

  createState(params, ctx) {
    const rng = new SeededRandom(ctx.rng.seed);
    const baseCenters = buildCenters(Math.round(params.attractorCount), ctx.width, ctx.height, rng, params.spread);
    const n = Math.round(params.count);
    const particles: Particle[] = [];
    for (let i = 0; i < n; i++) {
      const prng = rng.stream(i);
      const pt: Particle = { x: 0, y: 0, vx: 0, vy: 0, age: 0, maxAge: params.lifespan, sizeMul: 0.6 + prng.next() * 0.8, prevX: 0, prevY: 0, rng: prng };
      respawn(pt, ctx.width, ctx.height);
      pt.age = prng.range(0, params.lifespan);
      particles.push(pt);
    }
    return {
      particles, field: new FieldEngine(ctx.rng.seed), baseCenters,
      liveCenters: baseCenters.map((c) => ({ ...c })),
      focal: { x: 0.5, y: 0.5 }, key: keyOf(params, ctx.width, ctx.height),
    };
  },

  update(state, params, ctx) {
    const k = keyOf(params, ctx.width, ctx.height);
    if (k !== state.key) {
      const rng = new SeededRandom(ctx.rng.seed);
      state.baseCenters = buildCenters(Math.round(params.attractorCount), ctx.width, ctx.height, rng, params.spread);
      state.liveCenters = state.baseCenters.map((c) => ({ ...c }));
      const n = Math.round(params.count);
      const arr: Particle[] = [];
      for (let i = 0; i < n; i++) {
        const existing = state.particles[i];
        if (existing) { arr.push(existing); continue; }
        const prng = new SeededRandom(ctx.rng.seed).stream(i);
        const pt: Particle = { x: 0, y: 0, vx: 0, vy: 0, age: 0, maxAge: params.lifespan, sizeMul: 0.6 + prng.next() * 0.8, prevX: 0, prevY: 0, rng: prng };
        respawn(pt, ctx.width, ctx.height);
        arr.push(pt);
      }
      state.particles = arr;
      state.key = k;
    }

    // attractors drift slowly (Lissajous-ish) so the composition stays alive
    state.liveCenters = state.baseCenters.map((c, i) => ({
      x: c.x + Math.sin(ctx.time * 0.15 + i * 2.1) * params.wander * 90,
      y: c.y + Math.cos(ctx.time * 0.12 + i * 1.7) * params.wander * 90,
    }));

    const sources: ForceSource[] = state.liveCenters.map((c) => ({ kind: "attract", x: c.x, y: c.y, strength: params.strength * 500, radius: Math.hypot(ctx.width, ctx.height), falloff: 1.4 }));
    sources.push({ kind: "turbulence", x: 0, y: 0, strength: params.turbulence * 240, radius: 0, scale: 0.0022, speed: 0.1 });
    if (ctx.interactionEnabled && ctx.mouse.active) {
      sources.push({ kind: "repel", x: ctx.mouse.sx, y: ctx.mouse.sy, strength: 320, radius: 130, falloff: 2 });
    }
    state.field.sources = sources;

    // glow follows the attractor nearest the mouse (or the strongest/first when idle)
    let target = state.liveCenters[0] ?? { x: ctx.width / 2, y: ctx.height / 2 };
    if (params.followMouse) {
      if (ctx.interactionEnabled && ctx.mouse.active) {
        let best = Infinity;
        for (const c of state.liveCenters) {
          const d = Math.hypot(c.x - ctx.mouse.sx, c.y - ctx.mouse.sy);
          if (d < best) { best = d; target = c; }
        }
      } else {
        const t = (ctx.time * 0.08) % state.liveCenters.length;
        target = state.liveCenters[Math.floor(t)] ?? target;
      }
    }
    state.focal.x += (target.x / ctx.width - state.focal.x) * 0.04;
    state.focal.y += (target.y / ctx.height - state.focal.y) * 0.04;

    const w = ctx.width, h = ctx.height, margin = 60;
    for (const pt of state.particles) {
      pt.age += ctx.dt;
      pt.prevX = pt.x; pt.prevY = pt.y;
      if (pt.age > pt.maxAge || pt.x < -margin || pt.x > w + margin || pt.y < -margin || pt.y > h + margin) respawn(pt, w, h);
      const f = state.field.sample(pt.x, pt.y, ctx.time);
      behaviorAccelerate(pt, f, ctx.dt, { accel: 0.02, drag: params.drag, maxSpeed: 6 });
    }
  },

  render(state, params, ctx) {
    const { ctx: c } = ctx;
    const depthScale = ctx.depth === "off" ? 1 : ctx.depth === "subtle" ? 1.1 : 1.3;
    c.lineCap = "round";
    for (const pt of state.particles) {
      const lifeFade = Math.min(1, pt.age / 0.3) * Math.min(1, (pt.maxAge - pt.age) / 0.6);
      const speed = Math.hypot(pt.x - pt.prevX, pt.y - pt.prevY);
      const color = ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.focal, Math.min(1, speed * 0.15)), ctx.palette.background, 0.3);
      const css = oklchToCss(color);
      if (params.trailOpacity > 0.01 && speed > 0.05) {
        c.strokeStyle = css; c.globalAlpha = params.trailOpacity * lifeFade;
        c.lineWidth = Math.max(0.2, params.size * 0.4 * pt.sizeMul * depthScale);
        c.beginPath(); c.moveTo(pt.prevX, pt.prevY); c.lineTo(pt.x, pt.y); c.stroke();
        c.globalAlpha = 1;
      }
      drawParticle(c, { x: pt.x, y: pt.y, size: params.size * pt.sizeMul * depthScale, opacity: lifeFade, color: css }, { shape: params.shape as ParticleShape });
    }
  },
};
