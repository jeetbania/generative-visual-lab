/**
 * Radial Particle Burst — waves of particles pulse outward from a origin
 * region on a timed cycle (an animated parameter — pulse phase — modulating
 * spawn rate), decelerating via drag as they travel. A direct instance of
 * "an animation should be able to modulate any parameter."
 */

import { EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { FieldEngine, ForceSource } from "../engine/field";
import { behaviorAccelerate } from "../engine/behavior";
import { ensureContrast, mixOklch, oklchToCss, paletteSweep } from "../engine/color";
import { drawParticle, ParticleShape } from "../engine/particle";
import { SeededRandom } from "../engine/random";

export const radialBurstParams: ParamField[] = [
  { key: "originX", label: "Origin X", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "originY", label: "Origin Y", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "pulseInterval", label: "Pulse Interval (s)", section: "Field", type: "slider", min: 0.3, max: 6, step: 0.1, default: 1.6 },
  { key: "pulseWidth", label: "Pulse Width", section: "Field", type: "slider", min: 0.05, max: 1, step: 0.01, default: 0.25 },
  { key: "burstSpeed", label: "Burst Speed", section: "Field", type: "slider", min: 0.5, max: 8, step: 0.05, default: 2.6 },
  { key: "speedRandomness", label: "Speed Randomness", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.4 },
  { key: "drag", label: "Drag", section: "Field", type: "slider", min: 0, max: 0.1, step: 0.001, default: 0.012 },
  { key: "turbulence", label: "Turbulence", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.12 },

  { key: "count", label: "Count", section: "Particles", type: "slider", min: 100, max: 6000, step: 50, default: 1600, noMutate: true },
  { key: "shape", label: "Shape", section: "Particles", type: "select", options: ["dot", "circle", "plus", "line"], default: "dot" },
  { key: "size", label: "Size", section: "Particles", type: "slider", min: 0.4, max: 8, step: 0.1, default: 2.2 },
  { key: "sizeFalloff", label: "Size Falloff w/ Distance", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },

  { key: "mouseStrength", label: "Mouse Strength", section: "Interaction", type: "slider", min: 0, max: 3, step: 0.02, default: 0.7 },
  { key: "mouseRadius", label: "Influence Radius", section: "Interaction", type: "slider", min: 40, max: 700, step: 5, default: 220 },
];

export interface RadialBurstParams {
  originX: number; originY: number; pulseInterval: number; pulseWidth: number;
  burstSpeed: number; speedRandomness: number; drag: number; turbulence: number;
  count: number; shape: string; size: number; sizeFalloff: number;
  mouseStrength: number; mouseRadius: number;
}

interface Particle { x: number; y: number; vx: number; vy: number; active: boolean; dist: number; maxDist: number; sizeMul: number; spawnT: number; rng: SeededRandom }
interface RadialBurstState { particles: Particle[]; field: FieldEngine; key: string }

function keyOf(p: RadialBurstParams, w: number, h: number) { return `${Math.round(p.count)}:${w}:${h}`; }

export const radialBurstEffect: EffectDefinition<RadialBurstParams, RadialBurstState> = {
  id: "radial-burst",
  name: "Radial Particle Burst",
  category: "PARTICLES",
  description: "Timed waves of particles pulsing outward from an origin, decelerating as they travel.",
  fields: radialBurstParams,
  defaultParams: fieldDefaults<RadialBurstParams>(radialBurstParams),
  focalPoint: (p) => ({ x: p.originX, y: p.originY }),

  createState(params, ctx) {
    const rng = new SeededRandom(ctx.rng.seed);
    const n = Math.round(params.count);
    const particles: Particle[] = [];
    for (let i = 0; i < n; i++) {
      const prng = rng.stream(i);
      particles.push({ x: 0, y: 0, vx: 0, vy: 0, active: false, dist: 0, maxDist: Math.hypot(ctx.width, ctx.height) * prng.range(0.4, 0.75), sizeMul: 0.6 + prng.next() * 0.8, spawnT: prng.next(), rng: prng });
    }
    return { particles, field: new FieldEngine(ctx.rng.seed), key: keyOf(params, ctx.width, ctx.height) };
  },

  update(state, params, ctx) {
    const k = keyOf(params, ctx.width, ctx.height);
    if (k !== state.key) {
      const rng = new SeededRandom(ctx.rng.seed);
      const n = Math.round(params.count);
      const arr: Particle[] = [];
      for (let i = 0; i < n; i++) {
        const existing = state.particles[i];
        if (existing) { arr.push(existing); continue; }
        const prng = rng.stream(i);
        arr.push({ x: 0, y: 0, vx: 0, vy: 0, active: false, dist: 0, maxDist: Math.hypot(ctx.width, ctx.height) * prng.range(0.4, 0.75), sizeMul: 0.6 + prng.next() * 0.8, spawnT: prng.next(), rng: prng });
      }
      state.particles = arr;
      state.key = k;
    }

    const turbulence: ForceSource = { kind: "turbulence", x: 0, y: 0, strength: params.turbulence * 200, radius: 0, scale: 0.002, speed: 0.1 };
    const mouse: ForceSource = { kind: "repel", x: ctx.mouse.sx, y: ctx.mouse.sy, strength: ctx.interactionEnabled && ctx.mouse.active ? params.mouseStrength * 500 : 0, radius: params.mouseRadius, falloff: 1.8 };
    state.field.sources = [turbulence, mouse];

    const ox = params.originX * ctx.width, oy = params.originY * ctx.height;
    // pulsePhase (0..1, sawtooth over pulseInterval) is the "animation
    // modulating a parameter" — it drives emission timing, not just a shader-y wobble.
    const pulsePhase = (ctx.time % params.pulseInterval) / params.pulseInterval;
    const emitting = pulsePhase < params.pulseWidth;

    for (const pt of state.particles) {
      if (!pt.active) {
        // stagger spawns within the emitting window using each particle's own phase
        const triggerPhase = pt.spawnT * params.pulseWidth;
        if (emitting && pulsePhase >= triggerPhase) {
          pt.active = true;
          pt.dist = 0;
          const a = pt.rng.range(0, Math.PI * 2);
          const speed = params.burstSpeed * (1 + pt.rng.gaussian() * params.speedRandomness * 0.5);
          pt.vx = Math.cos(a) * speed; pt.vy = Math.sin(a) * speed;
          pt.x = ox; pt.y = oy;
        }
        continue;
      }
      const f = state.field.sample(pt.x, pt.y, ctx.time);
      const prevX = pt.x, prevY = pt.y;
      behaviorAccelerate(pt, f, ctx.dt * 60, { accel: 0.01, drag: params.drag });
      pt.dist += Math.hypot(pt.x - prevX, pt.y - prevY);
      if (pt.dist > pt.maxDist || pt.x < -50 || pt.x > ctx.width + 50 || pt.y < -50 || pt.y > ctx.height + 50) {
        pt.active = false;
      }
    }
  },

  render(state, params, ctx) {
    const { ctx: c } = ctx;
    const depthScale = ctx.depth === "off" ? 1 : ctx.depth === "subtle" ? 1.1 : 1.3;
    for (const pt of state.particles) {
      if (!pt.active) continue;
      const distT = Math.min(1, pt.dist / pt.maxDist);
      const fadeIn = Math.min(1, pt.dist / 40);
      const fadeOut = 1 - Math.pow(distT, 3);
      const opacity = fadeIn * fadeOut;
      if (opacity < 0.02) continue;
      const size = params.size * pt.sizeMul * depthScale * (1 - params.sizeFalloff * distT * 0.7);
      const color = ensureContrast(paletteSweep(ctx.palette, distT), ctx.palette.background, 0.3);
      drawParticle(c, { x: pt.x, y: pt.y, size, opacity, color: oklchToCss(mixOklch(ctx.palette.accent, color, 0.5)) }, { shape: params.shape as ParticleShape });
    }
  },
};
