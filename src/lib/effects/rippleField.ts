/**
 * Ripple Field — clicking emits an expanding wavefront that displaces a grid
 * of particles radially outward as it passes through them, the direct
 * "click creates ripple" interaction named in the brief. Multiple ripples
 * overlap and sum, and points near an active wavefront brighten briefly.
 */

import { EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { ensureContrast, mixOklch, oklchToCss } from "../engine/color";
import { drawParticle, ParticleShape } from "../engine/particle";
import { SeededRandom } from "../engine/random";

export const rippleFieldParams: ParamField[] = [
  { key: "columns", label: "Columns", section: "Grid", type: "slider", min: 6, max: 90, step: 1, default: 42, noMutate: true },
  { key: "rows", label: "Rows", section: "Grid", type: "slider", min: 6, max: 60, step: 1, default: 24, noMutate: true },
  { key: "jitter", label: "Grid Jitter", section: "Grid", type: "slider", min: 0, max: 1, step: 0.01, default: 0.3 },

  { key: "rippleSpeed", label: "Ripple Speed", section: "Ripples", type: "slider", min: 50, max: 1200, step: 10, default: 420 },
  { key: "rippleWidth", label: "Wavefront Width", section: "Ripples", type: "slider", min: 5, max: 120, step: 1, default: 36 },
  { key: "rippleAmplitude", label: "Amplitude", section: "Ripples", type: "slider", min: 0, max: 60, step: 1, default: 22 },
  { key: "rippleLifetime", label: "Lifetime (s)", section: "Ripples", type: "slider", min: 0.5, max: 8, step: 0.1, default: 3.2 },
  { key: "autoEmit", label: "Auto Emit", section: "Ripples", type: "toggle", default: true },
  { key: "autoInterval", label: "Auto Interval (s)", section: "Ripples", type: "slider", min: 0.5, max: 10, step: 0.1, default: 3 },

  { key: "shape", label: "Shape", section: "Particles", type: "select", options: ["dot", "circle", "square"], default: "dot" },
  { key: "size", label: "Size", section: "Particles", type: "slider", min: 0.4, max: 6, step: 0.1, default: 1.6 },
  { key: "opacity", label: "Opacity", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "glowBoost", label: "Wavefront Glow", section: "Particles", type: "slider", min: 0, max: 2, step: 0.02, default: 0.9 },
];

export interface RippleFieldParams {
  columns: number; rows: number; jitter: number;
  rippleSpeed: number; rippleWidth: number; rippleAmplitude: number; rippleLifetime: number; autoEmit: boolean; autoInterval: number;
  shape: string; size: number; opacity: number; glowBoost: number;
}

interface GridPoint { rx: number; ry: number }
interface Ripple { x: number; y: number; birth: number }
interface RippleFieldState { points: GridPoint[]; ripples: Ripple[]; prevDown: boolean; lastAuto: number; key: string }

function keyOf(p: RippleFieldParams, w: number, h: number) { return `${Math.round(p.columns)}:${Math.round(p.rows)}:${w}:${h}`; }

function buildPoints(cols: number, rows: number, w: number, h: number, jitter: number, seed: number): GridPoint[] {
  const pts: GridPoint[] = [];
  const cellW = w / cols, cellH = h / rows;
  const rng = new SeededRandom(seed);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const jx = rng.gaussian() * jitter * cellW * 0.3;
      const jy = rng.gaussian() * jitter * cellH * 0.3;
      pts.push({ rx: (i + 0.5) * cellW + jx, ry: (j + 0.5) * cellH + jy });
    }
  }
  return pts;
}

export const rippleFieldEffect: EffectDefinition<RippleFieldParams, RippleFieldState> = {
  id: "ripple-field",
  name: "Ripple Field",
  category: "EXPERIMENTAL",
  description: "Click to send an expanding wavefront through a field of particles.",
  fields: rippleFieldParams,
  defaultParams: fieldDefaults<RippleFieldParams>(rippleFieldParams),
  focalPoint: () => ({ x: 0.5, y: 0.5 }),

  createState(params, ctx) {
    return {
      points: buildPoints(Math.round(params.columns), Math.round(params.rows), ctx.width, ctx.height, params.jitter, ctx.rng.seed),
      ripples: [{ x: ctx.width / 2, y: ctx.height / 2, birth: 0 }],
      prevDown: false, lastAuto: 0, key: keyOf(params, ctx.width, ctx.height),
    };
  },

  update(state, params, ctx) {
    const k = keyOf(params, ctx.width, ctx.height);
    if (k !== state.key) {
      state.points = buildPoints(Math.round(params.columns), Math.round(params.rows), ctx.width, ctx.height, params.jitter, ctx.rng.seed);
      state.key = k;
    }

    if (ctx.interactionEnabled && ctx.mouse.down && !state.prevDown) {
      state.ripples.push({ x: ctx.mouse.x, y: ctx.mouse.y, birth: ctx.time });
    }
    state.prevDown = ctx.mouse.down;

    if (params.autoEmit && ctx.time - state.lastAuto > params.autoInterval) {
      state.ripples.push({ x: ctx.width / 2, y: ctx.height / 2, birth: ctx.time });
      state.lastAuto = ctx.time;
    }
    state.ripples = state.ripples.filter((r) => ctx.time - r.birth < params.rippleLifetime).slice(-10);
  },

  render(state, params, ctx) {
    const { ctx: c } = ctx;
    const depthScale = ctx.depth === "off" ? 1 : ctx.depth === "subtle" ? 1.1 : 1.3;
    const baseColor = ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.ambient, 0.3), ctx.palette.background, 0.26);
    const hotColor = ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.focal, 0.6), ctx.palette.background, 0.34);

    for (const p of state.points) {
      let dx = 0, dy = 0, glow = 0;
      for (const r of state.ripples) {
        const age = ctx.time - r.birth;
        if (age < 0) continue;
        const d = Math.hypot(p.rx - r.x, p.ry - r.y) || 0.001;
        const wavefront = age * params.rippleSpeed;
        const env = Math.exp(-Math.pow((d - wavefront) / params.rippleWidth, 2)) * (1 - age / params.rippleLifetime);
        const amp = env * params.rippleAmplitude;
        dx += ((p.rx - r.x) / d) * amp;
        dy += ((p.ry - r.y) / d) * amp;
        glow = Math.max(glow, env);
      }
      const x = p.rx + dx, y = p.ry + dy;
      const size = params.size * depthScale * (1 + glow * params.glowBoost);
      const opacity = Math.min(1, params.opacity * (1 + glow * params.glowBoost * 1.4));
      const color = glow > 0.02 ? oklchToCss(mixOklch(baseColor, hotColor, Math.min(1, glow * 2))) : oklchToCss(baseColor);
      drawParticle(c, { x, y, size, opacity, color }, { shape: params.shape as ParticleShape });
    }
  },
};
