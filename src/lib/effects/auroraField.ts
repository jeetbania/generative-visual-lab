/**
 * Aurora Field — soft, drifting atmospheric bands built directly from the
 * noise + color engines, with a few crisp "signal" lines cut through for
 * editorial contrast. Where String Field and Magnetic Field are geometric
 * particle systems, this one exists to show the gradient engine's range on
 * its own: pure atmosphere, no discrete particles.
 */

import { EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { paletteSweep, oklchToCss, oklchWithAlpha } from "../engine/color";

export const auroraFieldParams: ParamField[] = [
  { key: "bandCount", label: "Band Count", section: "Field", type: "slider", min: 2, max: 9, step: 1, default: 5, noMutate: true },
  { key: "bandAmplitude", label: "Amplitude", section: "Field", type: "slider", min: 10, max: 320, step: 2, default: 110 },
  { key: "bandThickness", label: "Thickness", section: "Field", type: "slider", min: 20, max: 260, step: 2, default: 90 },
  { key: "noiseScale", label: "Noise Scale", section: "Field", type: "slider", min: 0.3, max: 4, step: 0.02, default: 1.1 },
  { key: "noiseSpeed", label: "Drift Speed", section: "Field", type: "slider", min: 0, max: 1, step: 0.005, default: 0.06 },
  { key: "warp", label: "Domain Warp", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.4 },
  { key: "softness", label: "Softness", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: "bandOpacity", label: "Band Opacity", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },

  { key: "accentLines", label: "Accent Lines", section: "Accents", type: "slider", min: 0, max: 8, step: 1, default: 3, noMutate: true },
  { key: "accentOpacity", label: "Accent Opacity", section: "Accents", type: "slider", min: 0, max: 1, step: 0.01, default: 0.35 },
  { key: "accentThickness", label: "Accent Thickness", section: "Accents", type: "slider", min: 0.3, max: 2.5, step: 0.05, default: 0.8 },
  { key: "accentSpeed", label: "Accent Speed", section: "Accents", type: "slider", min: 0, max: 3, step: 0.02, default: 0.6 },
];

export interface AuroraFieldParams {
  bandCount: number; bandAmplitude: number; bandThickness: number;
  noiseScale: number; noiseSpeed: number; warp: number; softness: number; bandOpacity: number;
  accentLines: number; accentOpacity: number; accentThickness: number; accentSpeed: number;
}

interface AuroraFieldState { dashPhase: number }

function segmentsForQuality(q: string) {
  return q === "draft" ? 24 : q === "balanced" ? 40 : q === "high" ? 64 : 96;
}

export const auroraFieldEffect: EffectDefinition<AuroraFieldParams, AuroraFieldState> = {
  id: "aurora-field",
  name: "Aurora Field",
  category: "ATMOSPHERE",
  description: "Layered noise-driven atmospheric bands with crisp signal-line accents.",
  fields: auroraFieldParams,
  defaultParams: fieldDefaults<AuroraFieldParams>(auroraFieldParams),
  focalPoint: () => ({ x: 0.5, y: 0.42 }),

  createState() {
    return { dashPhase: 0 };
  },

  update(state, params, ctx) {
    state.dashPhase += ctx.dt * params.accentSpeed * 40;
  },

  render(state, params, ctx) {
    const { ctx: c, width: w, height: h } = ctx;
    const segs = segmentsForQuality(ctx.quality);
    const t = ctx.time * params.noiseSpeed;
    const useBlur = ctx.quality === "high" || ctx.quality === "ultra";

    c.save();
    if (useBlur) c.filter = `blur(${(params.softness * 18 + 4).toFixed(1)}px)`;

    const bandCount = Math.round(params.bandCount);
    for (let b = 0; b < bandCount; b++) {
      const bt = bandCount > 1 ? b / (bandCount - 1) : 0.5;
      const baseY = h * (0.12 + 0.76 * bt);
      const color = paletteSweep(ctx.palette, bt);
      const topPts: { x: number; y: number }[] = [];
      const botPts: { x: number; y: number }[] = [];

      for (let s = 0; s <= segs; s++) {
        const xt = s / segs;
        const x = xt * w;
        const warpX = ctx.noise.fbm2(xt * 1.4 + b * 5.2, t * 0.7, 3) * params.warp * 220;
        const n = ctx.noise.fbm2((x + warpX) * 0.0016 * params.noiseScale + b * 7.3, t + b * 0.6, 4);
        const thicknessN = 0.6 + 0.4 * ctx.noise.fbm2(xt * 2.1 + b * 3.1, t * 0.5 + 9, 2);
        const cy = baseY + n * params.bandAmplitude;
        const halfT = (params.bandThickness * thicknessN) / 2;
        topPts.push({ x, y: cy - halfT });
        botPts.push({ x, y: cy + halfT });
      }

      const grad = c.createLinearGradient(0, baseY - params.bandAmplitude, 0, baseY + params.bandAmplitude);
      grad.addColorStop(0, oklchToCss(oklchWithAlpha(color, 0)));
      grad.addColorStop(0.5, oklchToCss(oklchWithAlpha(color, params.bandOpacity)));
      grad.addColorStop(1, oklchToCss(oklchWithAlpha(color, 0)));

      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(topPts[0].x, topPts[0].y);
      for (let i = 1; i < topPts.length; i++) c.lineTo(topPts[i].x, topPts[i].y);
      for (let i = botPts.length - 1; i >= 0; i--) c.lineTo(botPts[i].x, botPts[i].y);
      c.closePath();
      c.fill();

      if (!useBlur && params.softness > 0.15) {
        // cheap softness fallback: a second, larger, fainter pass
        c.save();
        c.globalAlpha = params.softness * 0.35;
        c.scale(1, 1);
        c.fill();
        c.restore();
      }
    }
    c.restore();

    // accent signal lines — crisp, technical contrast against the soft field
    const lines = Math.round(params.accentLines);
    if (lines > 0 && params.accentOpacity > 0.01) {
      c.save();
      c.setLineDash([10, 14]);
      c.lineDashOffset = -state.dashPhase;
      c.lineCap = "round";
      for (let i = 0; i < lines; i++) {
        const lt = lines > 1 ? i / (lines - 1) : 0.5;
        const y0 = h * (0.2 + 0.6 * lt);
        c.strokeStyle = oklchToCss(oklchWithAlpha(ctx.palette.accent, params.accentOpacity));
        c.lineWidth = params.accentThickness;
        c.beginPath();
        for (let s = 0; s <= segs; s++) {
          const xt = s / segs;
          const x = xt * w;
          const n = ctx.noise.fbm2(xt * 1.1 + i * 3.7, t * 0.4 + i, 2);
          const y = y0 + n * params.bandAmplitude * 0.4;
          if (s === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
      }
      c.restore();
    }
  },
};
