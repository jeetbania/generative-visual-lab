/**
 * Data Stream — procedural bezier "channels" across the frame that EMIT
 * character/number particles along their length. Demonstrates: "a route
 * should be able to emit particles" (spawnAlongPath) and "a particle can be
 * a dot, character, number..." together, with particles inheriting the
 * atmosphere's color as they travel.
 */

import { EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { spawnAlongPath } from "../engine/source";
import { ensureContrast, oklchToCss } from "../engine/color";
import { drawParticle } from "../engine/particle";
import { SeededRandom } from "../engine/random";

export const dataStreamParams: ParamField[] = [
  { key: "channelCount", label: "Channels", section: "Field", type: "slider", min: 2, max: 24, step: 1, default: 10, noMutate: true },
  { key: "curviness", label: "Curviness", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.4 },
  { key: "orientation", label: "Orientation", section: "Field", type: "select", options: ["horizontal", "vertical"], default: "horizontal" },
  { key: "channelOpacity", label: "Channel Opacity", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.12 },

  { key: "density", label: "Particle Density", section: "Particles", type: "slider", min: 2, max: 60, step: 1, default: 22 },
  { key: "speed", label: "Speed", section: "Particles", type: "slider", min: 0.02, max: 2, step: 0.01, default: 0.35 },
  { key: "speedRandomness", label: "Speed Randomness", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.4 },
  { key: "particleType", label: "Particle Type", section: "Particles", type: "select", options: ["char", "dot", "line"], default: "char" },
  { key: "charset", label: "Character Set", section: "Particles", type: "text", default: "01" },
  { key: "size", label: "Size", section: "Particles", type: "slider", min: 4, max: 24, step: 0.5, default: 11 },
  { key: "opacity", label: "Opacity", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.8 },

  { key: "mouseStrength", label: "Mouse Scatter", section: "Interaction", type: "slider", min: 0, max: 2, step: 0.02, default: 0.6 },
  { key: "mouseRadius", label: "Influence Radius", section: "Interaction", type: "slider", min: 40, max: 700, step: 5, default: 180 },
];

export interface DataStreamParams {
  channelCount: number; curviness: number; orientation: string; channelOpacity: number;
  density: number; speed: number; speedRandomness: number; particleType: string; charset: string; size: number; opacity: number;
  mouseStrength: number; mouseRadius: number;
}

interface Channel { path: { x: number; y: number }[]; length: number }
interface StreamParticle { channelIdx: number; t: number; speedMul: number; char: string; sizeMul: number; opacityMul: number; rng: SeededRandom }
interface DataStreamState { channels: Channel[]; particles: StreamParticle[]; key: string }

function keyOf(p: DataStreamParams, w: number, h: number) {
  return `${Math.round(p.channelCount)}:${p.orientation}:${p.curviness.toFixed(2)}:${w}:${h}`;
}

function buildChannels(n: number, w: number, h: number, orientation: string, curviness: number, rng: SeededRandom): Channel[] {
  const channels: Channel[] = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5;
    const path: { x: number; y: number }[] = [];
    const steps = 40;
    const wob1 = rng.range(0.5, 1.5), wob2 = rng.range(0.5, 1.5), phase = rng.range(0, Math.PI * 2);
    for (let s = 0; s <= steps; s++) {
      const st = s / steps;
      if (orientation === "horizontal") {
        const y = h * (0.08 + 0.84 * t) + Math.sin(st * Math.PI * wob1 + phase) * h * 0.05 * curviness + Math.sin(st * Math.PI * 2 * wob2) * h * 0.02 * curviness;
        path.push({ x: st * w, y });
      } else {
        const x = w * (0.08 + 0.84 * t) + Math.sin(st * Math.PI * wob1 + phase) * w * 0.05 * curviness;
        path.push({ x, y: st * h });
      }
    }
    let length = 0;
    for (let s = 1; s < path.length; s++) length += Math.hypot(path[s].x - path[s - 1].x, path[s].y - path[s - 1].y);
    channels.push({ path, length });
  }
  return channels;
}

export const dataStreamEffect: EffectDefinition<DataStreamParams, DataStreamState> = {
  id: "data-stream",
  name: "Data Stream",
  category: "TYPOGRAPHY",
  description: "Procedural channels that emit flowing character particles — a route, but generative.",
  fields: dataStreamParams,
  defaultParams: fieldDefaults<DataStreamParams>(dataStreamParams),
  focalPoint: () => ({ x: 0.5, y: 0.5 }),

  createState(params, ctx) {
    const rng = new SeededRandom(ctx.rng.seed);
    const channels = buildChannels(Math.round(params.channelCount), ctx.width, ctx.height, params.orientation, params.curviness, rng);
    const particles: StreamParticle[] = [];
    const perChannel = Math.round(params.density);
    channels.forEach((_, ci) => {
      for (let i = 0; i < perChannel; i++) {
        const prng = rng.stream(ci * 1000 + i);
        const chars = params.charset || "01";
        particles.push({ channelIdx: ci, t: prng.next(), speedMul: 1 + prng.gaussian() * params.speedRandomness * 0.6, char: chars[Math.floor(prng.next() * chars.length) % chars.length], sizeMul: prng.range(0.7, 1.3), opacityMul: prng.range(0.5, 1), rng: prng });
      }
    });
    return { channels, particles, key: keyOf(params, ctx.width, ctx.height) };
  },

  update(state, params, ctx) {
    const k = keyOf(params, ctx.width, ctx.height);
    if (k !== state.key) {
      const rng = new SeededRandom(ctx.rng.seed);
      state.channels = buildChannels(Math.round(params.channelCount), ctx.width, ctx.height, params.orientation, params.curviness, rng);
      const particles: StreamParticle[] = [];
      const perChannel = Math.round(params.density);
      state.channels.forEach((_, ci) => {
        for (let i = 0; i < perChannel; i++) {
          const prng = rng.stream(ci * 1000 + i);
          const chars = params.charset || "01";
          particles.push({ channelIdx: ci, t: prng.next(), speedMul: 1 + prng.gaussian() * params.speedRandomness * 0.6, char: chars[Math.floor(prng.next() * chars.length) % chars.length], sizeMul: prng.range(0.7, 1.3), opacityMul: prng.range(0.5, 1), rng: prng });
        }
      });
      state.particles = particles;
      state.key = k;
    }
    for (const p of state.particles) {
      p.t += (ctx.dt * params.speed * p.speedMul) / 8;
      if (p.t > 1) { p.t -= 1; p.char = (params.charset || "01")[Math.floor(p.rng.next() * (params.charset || "01").length) % (params.charset || "01").length]; }
      if (p.t < 0) p.t += 1;
    }
  },

  render(state, params, ctx) {
    const { ctx: c, width: w, height: h } = ctx;
    const depthScale = ctx.depth === "off" ? 1 : ctx.depth === "subtle" ? 1.1 : 1.25;
    const mouseActive = ctx.interactionEnabled && ctx.mouse.active;

    if (params.channelOpacity > 0.01) {
      c.strokeStyle = oklchToCss(ensureContrast(ctx.palette.ambient, ctx.palette.background, 0.18));
      c.globalAlpha = params.channelOpacity;
      c.lineWidth = 1;
      for (const ch of state.channels) {
        c.beginPath();
        ch.path.forEach((pt, i) => (i === 0 ? c.moveTo(pt.x, pt.y) : c.lineTo(pt.x, pt.y)));
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    for (const p of state.particles) {
      const ch = state.channels[p.channelIdx];
      if (!ch) continue;
      let { x, y } = spawnAlongPath(ch.path, p.t);
      if (mouseActive) {
        const d = Math.hypot(x - ctx.mouse.sx, y - ctx.mouse.sy);
        if (d < params.mouseRadius) {
          const push = (1 - d / params.mouseRadius) * params.mouseStrength * 22;
          const a = Math.atan2(y - ctx.mouse.sy, x - ctx.mouse.sx);
          x += Math.cos(a) * push; y += Math.sin(a) * push;
        }
      }
      const color = ctx.sampleAtmosphere ? ensureContrast(ctx.sampleAtmosphere(x / w, y / h), ctx.palette.background, 0.32) : ctx.palette.accent;
      const edgeFade = Math.min(1, p.t * 8) * Math.min(1, (1 - p.t) * 8);
      drawParticle(c, {
        x, y, size: params.size * p.sizeMul * depthScale,
        opacity: params.opacity * p.opacityMul * edgeFade,
        color: oklchToCss(color),
      }, { shape: params.particleType as never, char: p.char });
    }
  },
};
