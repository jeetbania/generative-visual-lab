/**
 * Noise Landscape — a stack of horizontal contour lines displaced by a
 * shared fbm height-field, like a topographic survey. Depth (scale, opacity,
 * thickness) increases toward the front rows for real parallax.
 */

import { EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { ensureContrast, mixOklch, oklchToCss, paletteSweep } from "../engine/color";

export const noiseLandscapeParams: ParamField[] = [
  { key: "rowCount", label: "Row Count", section: "Field", type: "slider", min: 8, max: 80, step: 1, default: 36, noMutate: true },
  { key: "amplitude", label: "Amplitude", section: "Field", type: "slider", min: 5, max: 200, step: 1, default: 60 },
  { key: "noiseScale", label: "Noise Scale", section: "Field", type: "slider", min: 0.3, max: 5, step: 0.02, default: 1.4 },
  { key: "octaves", label: "Octaves", section: "Field", type: "slider", min: 1, max: 6, step: 1, default: 3 },
  { key: "driftSpeed", label: "Drift Speed", section: "Field", type: "slider", min: 0, max: 1, step: 0.005, default: 0.05 },
  { key: "tilt", label: "Perspective Tilt", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.55 },

  { key: "thickness", label: "Line Thickness", section: "Appearance", type: "slider", min: 0.2, max: 3, step: 0.05, default: 0.9 },
  { key: "opacity", label: "Opacity", section: "Appearance", type: "slider", min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: "segments", label: "Resolution", section: "Appearance", type: "slider", min: 20, max: 200, step: 5, default: 90 },

  { key: "mouseStrength", label: "Mouse Lift", section: "Interaction", type: "slider", min: 0, max: 2, step: 0.02, default: 0.5 },
  { key: "mouseRadius", label: "Influence Radius", section: "Interaction", type: "slider", min: 40, max: 700, step: 5, default: 260 },
];

export interface NoiseLandscapeParams {
  rowCount: number; amplitude: number; noiseScale: number; octaves: number; driftSpeed: number; tilt: number;
  thickness: number; opacity: number; segments: number;
  mouseStrength: number; mouseRadius: number;
}

interface NoiseLandscapeState { rowOffsets: number[] }

export const noiseLandscapeEffect: EffectDefinition<NoiseLandscapeParams, NoiseLandscapeState> = {
  id: "noise-landscape",
  name: "Noise Landscape",
  category: "GEOMETRY",
  description: "Topographic contour rows carved from a shared fbm height field, with real perspective depth.",
  fields: noiseLandscapeParams,
  defaultParams: fieldDefaults<NoiseLandscapeParams>(noiseLandscapeParams),
  focalPoint: () => ({ x: 0.5, y: 0.38 }),

  createState(params) {
    const rows = Math.round(params.rowCount);
    const rowOffsets = Array.from({ length: rows }, (_, i) => (i / Math.max(1, rows - 1)) * 997.7);
    return { rowOffsets };
  },

  update(state, params) {
    const rows = Math.round(params.rowCount);
    if (state.rowOffsets.length !== rows) {
      state.rowOffsets = Array.from({ length: rows }, (_, i) => (i / Math.max(1, rows - 1)) * 997.7);
    }
  },

  render(state, params, ctx) {
    const { ctx: c, width: w, height: h, noise } = ctx;
    const rows = Math.round(params.rowCount);
    const segs = Math.round(params.segments);
    const depthOn = ctx.depth !== "off";
    const mouseActive = ctx.interactionEnabled && ctx.mouse.active;

    for (let r = 0; r < rows; r++) {
      const rt = rows > 1 ? r / (rows - 1) : 0.5;
      // perspective: rows compress toward the horizon (top) and spread near the front (bottom)
      const persp = Math.pow(rt, 1 + params.tilt * 1.5);
      const baseY = h * (0.08 + 0.86 * persp);
      const rowDepth = depthOn ? 0.35 + 0.65 * persp : 1;
      const rowAmp = params.amplitude * (0.3 + 0.7 * persp);
      const color = ensureContrast(paletteSweep(ctx.palette, rt), ctx.palette.background, 0.26);
      const css = oklchToCss(mixOklch(color, ctx.palette.accent, 0.15));

      c.strokeStyle = css;
      c.globalAlpha = params.opacity * rowDepth;
      c.lineWidth = Math.max(0.15, params.thickness * (0.5 + rowDepth * 0.9));
      c.lineCap = "round";
      c.beginPath();
      for (let s = 0; s <= segs; s++) {
        const xt = s / segs;
        const x = xt * w;
        const n = noise.fbm2(xt * params.noiseScale * 2.2 + state.rowOffsets[r] + ctx.time * params.driftSpeed, rt * 1.6, Math.round(params.octaves));
        let y = baseY - n * rowAmp;
        if (mouseActive) {
          const d = Math.hypot(x - ctx.mouse.sx, y - ctx.mouse.sy);
          const lift = Math.exp(-Math.pow(d / params.mouseRadius, 2) * 2) * params.mouseStrength * 40;
          y -= lift;
        }
        if (s === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  },
};
