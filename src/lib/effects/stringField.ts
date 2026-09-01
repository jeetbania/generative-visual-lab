/**
 * Organic String Field — hundreds of hairline strands emerging from a
 * region, bent by a real force field (turbulence + a lateral "sweep" that
 * relaxes toward the tip) and simulated with spring-damper physics so the
 * mouse repels/attracts them with genuine inertia and slow recovery.
 */

import { EffectContext, EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { FieldEngine, ForceSource } from "../engine/field";
import { ensureContrast, mixOklch, oklchToCss, oklchWithAlpha } from "../engine/color";
import { drawParticle } from "../engine/particle";
import { SeededRandom } from "../engine/random";

export const stringFieldParams: ParamField[] = [
  // Field
  { key: "originMode", label: "Origin Mode", section: "Field", type: "select", options: ["single", "dual", "center"], default: "single" },
  { key: "originX", label: "Origin X", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "originY", label: "Origin Y", section: "Field", type: "slider", min: 0, max: 1.3, step: 0.01, default: 1.05 },
  { key: "spread", label: "Spread", section: "Field", type: "slider", min: 0, max: 200, step: 1, default: 40 },
  { key: "baseAngle", label: "Direction", section: "Field", type: "slider", min: -180, max: 180, step: 1, default: -90 },
  { key: "angularSpread", label: "Angular Spread", section: "Field", type: "slider", min: 10, max: 340, step: 1, default: 168 },
  { key: "curvature", label: "Curvature", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.42 },
  { key: "turbulence", label: "Turbulence", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.12 },
  { key: "turbulenceScale", label: "Turbulence Scale", section: "Field", type: "slider", min: 0.1, max: 5, step: 0.05, default: 1.1 },
  { key: "springStrength", label: "Spring Strength", section: "Field", type: "slider", min: 0.01, max: 1, step: 0.01, default: 0.18 },
  { key: "damping", label: "Damping", section: "Field", type: "slider", min: 0.8, max: 0.99, step: 0.005, default: 0.9 },
  { key: "drift", label: "Idle Drift", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.25 },

  // Strings
  { key: "count", label: "Count", section: "Strings", type: "slider", min: 20, max: 900, step: 1, default: 260, noMutate: true },
  { key: "length", label: "Length", section: "Strings", type: "slider", min: 50, max: 1000, step: 1, default: 520 },
  { key: "lengthRandomness", label: "Length Randomness", section: "Strings", type: "slider", min: 0, max: 1, step: 0.01, default: 0.45 },
  { key: "thickness", label: "Thickness", section: "Strings", type: "slider", min: 0.2, max: 3, step: 0.05, default: 0.9 },
  { key: "thicknessRandomness", label: "Thickness Randomness", section: "Strings", type: "slider", min: 0, max: 1, step: 0.01, default: 0.4 },
  { key: "taper", label: "Taper", section: "Strings", type: "slider", min: 0, max: 1, step: 0.01, default: 0.75 },
  { key: "opacity", label: "Opacity", section: "Strings", type: "slider", min: 0, max: 1, step: 0.01, default: 0.55 },
  { key: "opacityRandomness", label: "Opacity Randomness", section: "Strings", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "densityFalloff", label: "Edge Falloff", section: "Strings", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },

  // Particles
  { key: "particleType", label: "Particle Type", section: "Particles", type: "select", options: ["none", "dot", "circle", "square", "cross", "plus", "char"], default: "dot" },
  { key: "particleChar", label: "Character", section: "Particles", type: "text", default: "•" },
  { key: "particleDensity", label: "Density", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.55 },
  { key: "particleSize", label: "Size", section: "Particles", type: "slider", min: 1, max: 16, step: 0.5, default: 4.5 },
  { key: "particleSizeRandomness", label: "Size Randomness", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: "particleOpacity", label: "Opacity", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.9 },

  // Interaction
  { key: "mouseMode", label: "Mouse Mode", section: "Interaction", type: "select", options: ["repel", "attract"], default: "repel" },
  { key: "mouseRadius", label: "Influence Radius", section: "Interaction", type: "slider", min: 20, max: 700, step: 5, default: 220 },
  { key: "mouseForce", label: "Mouse Force", section: "Interaction", type: "slider", min: 0, max: 3, step: 0.02, default: 1.1 },

  // Color
  { key: "colorSpan", label: "Color Span", section: "Color", type: "slider", min: 0, max: 1, step: 0.01, default: 1 },
  { key: "dotBrightness", label: "Dot Brightness", section: "Color", type: "slider", min: 0, max: 1, step: 0.01, default: 0.7 },
];

export interface StringFieldParams {
  originMode: "single" | "dual" | "center";
  originX: number; originY: number; spread: number;
  baseAngle: number; angularSpread: number; curvature: number;
  turbulence: number; turbulenceScale: number;
  springStrength: number; damping: number; drift: number;
  count: number; length: number; lengthRandomness: number;
  thickness: number; thicknessRandomness: number; taper: number;
  opacity: number; opacityRandomness: number; densityFalloff: number;
  particleType: string; particleChar: string; particleDensity: number;
  particleSize: number; particleSizeRandomness: number; particleOpacity: number;
  mouseMode: "repel" | "attract"; mouseRadius: number; mouseForce: number;
  colorSpan: number; dotBrightness: number;
}

interface AlongParticle { t: number; size: number; phase: number }
interface Strand {
  rest: { x: number; y: number }[];
  cur: { x: number; y: number }[];
  vel: { x: number; y: number }[];
  driftSeed: number;
  thickness: number;
  opacityMul: number;
  hasTip: boolean;
  tipSize: number;
  along: AlongParticle[];
}

interface StringFieldState {
  strands: Strand[];
  field: FieldEngine;
  key: string;
}

function segmentsForQuality(q: string) {
  return q === "draft" ? 8 : q === "balanced" ? 12 : q === "high" ? 18 : 24;
}
function bandsForQuality(q: string) {
  return q === "draft" ? 2 : q === "balanced" ? 3 : q === "high" ? 4 : 5;
}

function buildStrands(p: StringFieldParams, ctx: EffectContext): Strand[] {
  const rng = new SeededRandom(ctx.rng.seed);
  const { width: w, height: h } = ctx;
  const segments = segmentsForQuality(ctx.quality);
  const strands: Strand[] = [];
  const count = Math.round(p.count);

  const singleOrigin = { x: p.originX * w, y: p.originY * h };
  const leftOrigin = { x: w * 0.08, y: h * (p.originMode === "dual" ? 0.5 : p.originY) };
  const rightOrigin = { x: w * 0.92, y: h * (p.originMode === "dual" ? 0.5 : p.originY) };

  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;
    const edgeDist = Math.abs(t - 0.5) * 2; // 0 center .. 1 edge

    let origin: { x: number; y: number };
    let theta0: number;
    let bendSign: number;

    if (p.originMode === "dual") {
      const left = i < count / 2;
      const tt = left ? i / (count / 2) : (i - count / 2) / (count / 2);
      origin = left ? leftOrigin : rightOrigin;
      const spreadHalf = (p.angularSpread * Math.PI) / 360;
      const base = (p.baseAngle * Math.PI) / 180;
      theta0 = left ? base - spreadHalf + tt * spreadHalf * 2 : Math.PI - (base - spreadHalf + tt * spreadHalf * 2);
      bendSign = left ? 1 : -1;
    } else {
      origin = p.originMode === "center" ? { x: w / 2, y: h / 2 } : singleOrigin;
      const base = (p.baseAngle * Math.PI) / 180;
      const spread = (p.angularSpread * Math.PI) / 180;
      theta0 = base - spread / 2 + t * spread;
      bendSign = t < 0.5 ? -1 : 1;
    }

    const jx = rng.gaussian() * p.spread * 0.4;
    const jy = rng.gaussian() * p.spread * 0.4;
    const start = { x: origin.x + jx, y: origin.y + jy };

    const falloffMul = 1 - p.densityFalloff * Math.pow(edgeDist, 1.6) * 0.7;
    const len = p.length * (1 + rng.gaussian() * p.lengthRandomness * 0.4) * falloffMul;
    const stepLen = len / segments;

    let angle = theta0;
    const pts: { x: number; y: number }[] = [start];
    let pos = { ...start };
    const bendStrength = p.curvature * bendSign * rng.range(0.6, 1.2);
    for (let s = 1; s <= segments; s++) {
      const tp = s / segments;
      const relax = Math.pow(1 - tp, 1.4);
      const curl = ctx.noise.curl2(pos.x * 0.002 * p.turbulenceScale, pos.y * 0.002 * p.turbulenceScale, i * 0.05);
      angle += (bendStrength * 0.09 * relax) + curl.x * p.turbulence * 0.15;
      pos = { x: pos.x + Math.cos(angle) * stepLen, y: pos.y + Math.sin(angle) * stepLen };
      pts.push(pos);
    }

    strands.push({
      rest: pts,
      cur: pts.map((pt) => ({ ...pt })),
      vel: pts.map(() => ({ x: 0, y: 0 })),
      driftSeed: rng.next() * 1000,
      thickness: Math.max(0.15, p.thickness * (1 + rng.gaussian() * p.thicknessRandomness * 0.5)) * falloffMul,
      opacityMul: Math.max(0, Math.min(1.4, 1 + rng.gaussian() * p.opacityRandomness * 0.6)) * falloffMul,
      hasTip: rng.chance(0.25 + p.particleDensity * 0.5),
      tipSize: 1 + rng.next() * p.particleSizeRandomness * 1.5,
      along: (() => {
        const n = Math.round(p.particleDensity * 4);
        const arr: AlongParticle[] = [];
        for (let k = 0; k < n; k++) arr.push({ t: rng.range(0.15, 0.95), size: rng.range(0.3, 1), phase: rng.next() * Math.PI * 2 });
        return arr;
      })(),
    });
  }
  return strands;
}

function keyOf(p: StringFieldParams, w: number, h: number, q: string) {
  return JSON.stringify([p.originMode, p.originX, p.originY, p.spread, p.baseAngle, p.angularSpread, p.curvature,
    p.turbulenceScale, p.count, p.length, p.lengthRandomness, p.densityFalloff, p.particleDensity,
    p.thickness, p.thicknessRandomness, p.opacityRandomness, w, h, q]);
}

export const stringFieldEffect: EffectDefinition<StringFieldParams, StringFieldState> = {
  id: "string-field",
  name: "Organic String Field",
  category: "FIELDS",
  description: "Hairline strands bent by a live force field, with spring-damped mouse interaction.",
  fields: stringFieldParams,
  defaultParams: fieldDefaults<StringFieldParams>(stringFieldParams),
  focalPoint: (p) => (p.originMode === "dual" ? { x: 0.5, y: 0.5 } : { x: p.originX, y: Math.min(1, p.originY) }),

  createState(params, ctx) {
    return { strands: buildStrands(params, ctx), field: new FieldEngine(ctx.rng.seed), key: keyOf(params, ctx.width, ctx.height, ctx.quality) };
  },

  update(state, params, ctx) {
    const k = keyOf(params, ctx.width, ctx.height, ctx.quality);
    if (k !== state.key) {
      state.strands = buildStrands(params, ctx);
      state.key = k;
    }

    const mouseSource: ForceSource = {
      kind: params.mouseMode === "repel" ? "repel" : "attract",
      x: ctx.mouse.sx, y: ctx.mouse.sy,
      strength: ctx.interactionEnabled && ctx.mouse.active ? params.mouseForce * 260 : 0,
      radius: params.mouseRadius,
      falloff: 2,
    };
    state.field.sources = [mouseSource];

    const dt = Math.min(0.05, ctx.dt) * 60; // normalize to ~60fps step units
    for (const strand of state.strands) {
      for (let j = 1; j < strand.cur.length; j++) {
        const rest = strand.rest[j];
        const driftX = ctx.noise.simplex3(j * 0.3, strand.driftSeed, ctx.time * 0.06) * params.drift * 14;
        const driftY = ctx.noise.simplex3(j * 0.3 + 50, strand.driftSeed, ctx.time * 0.06) * params.drift * 14;
        const targetX = rest.x + driftX, targetY = rest.y + driftY;
        const f = state.field.sample(strand.cur[j].x, strand.cur[j].y, ctx.time);
        const cur = strand.cur[j], vel = strand.vel[j];
        const springFx = (targetX - cur.x) * params.springStrength;
        const springFy = (targetY - cur.y) * params.springStrength;
        vel.x = (vel.x + (springFx + f.x) * dt * 0.06) * params.damping;
        vel.y = (vel.y + (springFy + f.y) * dt * 0.06) * params.damping;
        cur.x += vel.x * dt;
        cur.y += vel.y * dt;
      }
    }
  },

  render(state, params, ctx) {
    const { ctx: c } = ctx;
    const bands = bandsForQuality(ctx.quality);
    const depthScale = ctx.depth === "off" ? 1 : ctx.depth === "subtle" ? 1.15 : 1.35;

    for (const strand of state.strands) {
      const pts = strand.cur;
      if (pts.length < 2) continue;
      // Lines are FOREGROUND ink, not background atmosphere — `focal`/`atmosphere`
      // are deliberately close to the background lightness for a soft glow, so
      // we derive from `accent` (already contrast-aware) and guarantee a floor.
      const lineColorA = ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.focal, 0.35), ctx.palette.background, 0.32);
      const lineColorB = ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.atmosphere, 0.55), ctx.palette.background, 0.24);
      const grad = c.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
      const span = Math.max(0.05, params.colorSpan);
      grad.addColorStop(0, oklchToCss(oklchWithAlpha(lineColorA, params.opacity * strand.opacityMul)));
      grad.addColorStop(Math.min(1, span), oklchToCss(oklchWithAlpha(lineColorB, params.opacity * strand.opacityMul * 0.5)));
      if (span < 1) grad.addColorStop(1, oklchToCss(oklchWithAlpha(lineColorB, params.opacity * strand.opacityMul * 0.35)));

      c.strokeStyle = grad;
      c.lineCap = "round";
      c.lineJoin = "round";

      for (let b = 0; b < bands; b++) {
        const bandT0 = b / bands, bandT1 = (b + 1) / bands;
        const i0 = Math.floor(bandT0 * (pts.length - 1));
        const i1 = Math.max(i0 + 1, Math.ceil(bandT1 * (pts.length - 1)));
        const taperMul = 1 - params.taper * bandT0;
        c.lineWidth = Math.max(0.12, strand.thickness * taperMul * depthScale);
        c.beginPath();
        c.moveTo(pts[i0].x, pts[i0].y);
        for (let j = i0 + 1; j <= i1 && j < pts.length; j++) {
          const mx = (pts[j - 1].x + pts[j].x) / 2;
          const my = (pts[j - 1].y + pts[j].y) / 2;
          c.quadraticCurveTo(pts[j - 1].x, pts[j - 1].y, mx, my);
        }
        c.stroke();
      }

      if (params.particleType !== "none") {
        const tip = pts[pts.length - 1];
        const dotColor = oklchToCss(oklchWithAlpha(ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.glow, 1 - params.dotBrightness), ctx.palette.background, 0.3), 1));
        if (strand.hasTip) {
          drawParticle(c, {
            x: tip.x, y: tip.y,
            size: params.particleSize * strand.tipSize * depthScale,
            opacity: params.particleOpacity * strand.opacityMul,
            color: dotColor,
          }, { shape: params.particleType as never, char: params.particleChar });
        }
        for (const ap of strand.along) {
          const idx = Math.min(pts.length - 1, Math.floor(ap.t * (pts.length - 1)));
          const pt = pts[idx];
          const twinkle = 0.75 + 0.25 * Math.sin(ctx.time * 0.8 + ap.phase);
          drawParticle(c, {
            x: pt.x, y: pt.y,
            size: params.particleSize * ap.size * 0.7,
            opacity: params.particleOpacity * strand.opacityMul * 0.6 * twinkle,
            color: dotColor,
          }, { shape: params.particleType as never, char: params.particleChar });
        }
      }
    }
  },

  renderSVG(state, params, ctx) {
    const dotColor = oklchToCss(ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.glow, 1 - params.dotBrightness), ctx.palette.background, 0.3));
    const lineColorA = ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.focal, 0.35), ctx.palette.background, 0.32);
    const lineColorB = ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.atmosphere, 0.55), ctx.palette.background, 0.24);
    const bg = oklchToCss(ctx.palette.background);
    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${ctx.width}" height="${ctx.height}" viewBox="0 0 ${ctx.width} ${ctx.height}">`);
    parts.push(`<rect width="${ctx.width}" height="${ctx.height}" fill="${bg}" />`);
    state.strands.forEach((strand, i) => {
      const pts = strand.cur;
      if (pts.length < 2) return;
      const a = pts[0], b = pts[pts.length - 1];
      const gradId = `sg${i}`;
      parts.push(`<linearGradient id="${gradId}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" gradientUnits="userSpaceOnUse">`);
      parts.push(`<stop offset="0" stop-color="${oklchToCss(lineColorA)}" stop-opacity="${(params.opacity * strand.opacityMul).toFixed(3)}" />`);
      parts.push(`<stop offset="1" stop-color="${oklchToCss(lineColorB)}" stop-opacity="${(params.opacity * strand.opacityMul * 0.4).toFixed(3)}" />`);
      parts.push(`</linearGradient>`);
      const d = pts.map((p, j) => `${j === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
      parts.push(`<path d="${d}" fill="none" stroke="url(#${gradId})" stroke-width="${strand.thickness.toFixed(2)}" stroke-linecap="round" />`);
      if (strand.hasTip && params.particleType !== "none") {
        const tip = pts[pts.length - 1];
        const r = (params.particleSize * strand.tipSize) / 2;
        parts.push(`<circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${dotColor}" fill-opacity="${params.particleOpacity.toFixed(2)}" />`);
      }
    });
    parts.push(`</svg>`);
    return parts.join("\n");
  },
};
