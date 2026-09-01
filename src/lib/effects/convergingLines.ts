/**
 * Converging Lines — strands rooted at the frame's edges, drawn toward one
 * or more vanishing points, with curl noise as the PRIMARY bend mechanic
 * (rather than String Field's spring-damper fan). Demonstrates: "a string
 * system should be able to follow curl noise" as the defining behavior of
 * an otherwise very different composition.
 */

import { EffectContext, EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { ensureContrast, mixOklch, oklchToCss, oklchWithAlpha } from "../engine/color";
import { SeededRandom } from "../engine/random";

export const convergingLinesParams: ParamField[] = [
  { key: "vanishCount", label: "Vanishing Points", section: "Field", type: "slider", min: 1, max: 3, step: 1, default: 1, noMutate: true },
  { key: "convergence", label: "Convergence", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.72 },
  { key: "curlStrength", label: "Curl Strength", section: "Field", type: "slider", min: 0, max: 1.5, step: 0.01, default: 0.55 },
  { key: "curlScale", label: "Curl Scale", section: "Field", type: "slider", min: 0.2, max: 4, step: 0.02, default: 1.2 },
  { key: "drift", label: "Drift Speed", section: "Field", type: "slider", min: 0, max: 1, step: 0.01, default: 0.15 },

  { key: "count", label: "Count", section: "Strings", type: "slider", min: 30, max: 500, step: 1, default: 160, noMutate: true },
  { key: "thickness", label: "Thickness", section: "Strings", type: "slider", min: 0.2, max: 3, step: 0.05, default: 0.8 },
  { key: "opacity", label: "Opacity", section: "Strings", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "opacityRandomness", label: "Opacity Randomness", section: "Strings", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "segments", label: "Resolution", section: "Strings", type: "slider", min: 6, max: 40, step: 1, default: 22 },

  { key: "mouseStrength", label: "Mouse Strength", section: "Interaction", type: "slider", min: 0, max: 2, step: 0.02, default: 0.6 },
  { key: "mouseRadius", label: "Influence Radius", section: "Interaction", type: "slider", min: 40, max: 700, step: 5, default: 260 },
];

export interface ConvergingLinesParams {
  vanishCount: number; convergence: number; curlStrength: number; curlScale: number; drift: number;
  count: number; thickness: number; opacity: number; opacityRandomness: number; segments: number;
  mouseStrength: number; mouseRadius: number;
}

interface Strand { startX: number; startY: number; vanishIdx: number; opacityMul: number; seedOffset: number }
interface ConvergingLinesState { strands: Strand[]; vanishPoints: { x: number; y: number }[]; key: string }

function keyOf(p: ConvergingLinesParams, w: number, h: number) { return `${Math.round(p.count)}:${Math.round(p.vanishCount)}:${w}:${h}`; }

function buildVanishPoints(n: number, w: number, h: number): { x: number; y: number }[] {
  if (n === 1) return [{ x: w / 2, y: h / 2 }];
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) pts.push({ x: w * (0.3 + 0.4 * (i / Math.max(1, n - 1))), y: h * 0.5 });
  return pts;
}

function edgePoint(rng: SeededRandom, w: number, h: number): { x: number; y: number } {
  const edge = rng.int(0, 3);
  if (edge === 0) return { x: rng.range(0, w), y: -4 };
  if (edge === 1) return { x: rng.range(0, w), y: h + 4 };
  if (edge === 2) return { x: -4, y: rng.range(0, h) };
  return { x: w + 4, y: rng.range(0, h) };
}

export const convergingLinesEffect: EffectDefinition<ConvergingLinesParams, ConvergingLinesState> = {
  id: "converging-lines",
  name: "Converging Lines",
  category: "GEOMETRY",
  description: "Edge-rooted strands drawn toward vanishing points, bent primarily by curl noise.",
  fields: convergingLinesParams,
  defaultParams: fieldDefaults<ConvergingLinesParams>(convergingLinesParams),
  focalPoint: (p, state: ConvergingLinesState | undefined) => {
    const vp = state?.vanishPoints[0];
    return vp ? { x: vp.x, y: vp.y } : { x: 0.5, y: 0.5 };
  },

  createState(params, ctx) {
    const rng = new SeededRandom(ctx.rng.seed);
    const vanishPoints = buildVanishPoints(Math.round(params.vanishCount), ctx.width, ctx.height);
    const n = Math.round(params.count);
    const strands: Strand[] = [];
    for (let i = 0; i < n; i++) {
      const prng = rng.stream(i);
      const p = edgePoint(prng, ctx.width, ctx.height);
      strands.push({ startX: p.x, startY: p.y, vanishIdx: prng.int(0, vanishPoints.length - 1), opacityMul: 1 + prng.gaussian() * params.opacityRandomness * 0.6, seedOffset: prng.next() * 1000 });
    }
    return { strands, vanishPoints, key: keyOf(params, ctx.width, ctx.height) };
  },

  update(state, params, ctx) {
    const k = keyOf(params, ctx.width, ctx.height);
    if (k !== state.key) {
      const rng = new SeededRandom(ctx.rng.seed);
      state.vanishPoints = buildVanishPoints(Math.round(params.vanishCount), ctx.width, ctx.height);
      const n = Math.round(params.count);
      const strands: Strand[] = [];
      for (let i = 0; i < n; i++) {
        const prng = rng.stream(i);
        const p = edgePoint(prng, ctx.width, ctx.height);
        strands.push({ startX: p.x, startY: p.y, vanishIdx: prng.int(0, state.vanishPoints.length - 1), opacityMul: 1 + prng.gaussian() * params.opacityRandomness * 0.6, seedOffset: prng.next() * 1000 });
      }
      state.strands = strands;
      state.key = k;
    }
    // vanishing points drift very slowly for idle life
    const base = buildVanishPoints(Math.round(params.vanishCount), ctx.width, ctx.height);
    state.vanishPoints = base.map((p, i) => ({
      x: p.x + Math.sin(ctx.time * 0.05 + i * 3) * ctx.width * 0.02,
      y: p.y + Math.cos(ctx.time * 0.04 + i * 2) * ctx.height * 0.02,
    }));
  },

  render(state, params, ctx: EffectContext) {
    const { ctx: c, noise } = ctx;
    const segs = Math.round(params.segments);
    const depthScale = ctx.depth === "off" ? 1 : ctx.depth === "subtle" ? 1.15 : 1.35;
    const lineColorA = ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.focal, 0.35), ctx.palette.background, 0.3);
    const lineColorB = ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.atmosphere, 0.5), ctx.palette.background, 0.22);

    const mouseActive = ctx.interactionEnabled && ctx.mouse.active;

    for (const strand of state.strands) {
      const vp = state.vanishPoints[strand.vanishIdx] ?? state.vanishPoints[0];
      const pts: { x: number; y: number }[] = [{ x: strand.startX, y: strand.startY }];
      let pos = { x: strand.startX, y: strand.startY };
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        // Pull toward the vanishing point scaled by `convergence`, primarily
        // bent via curl noise sampled at the CURRENT position — the string
        // genuinely follows the flow field rather than a scripted easing curve.
        const targetX = strand.startX + (vp.x - strand.startX) * t;
        const targetY = strand.startY + (vp.y - strand.startY) * t;
        const pull = (1 / (segs - s + 1)) * (0.3 + params.convergence * 0.7);
        const curl = noise.curl2((pos.x + strand.seedOffset) * 0.0022 * params.curlScale, pos.y * 0.0022 * params.curlScale, ctx.time * params.drift * 0.3);
        const bend = 1 - t; // strongest near the free end, relaxes toward the vanishing point
        pos = {
          x: pos.x + (targetX - pos.x) * pull + curl.x * params.curlStrength * 40 * bend * (1 / segs),
          y: pos.y + (targetY - pos.y) * pull + curl.y * params.curlStrength * 40 * bend * (1 / segs),
        };
        if (mouseActive) {
          const mdx = pos.x - ctx.mouse.sx, mdy = pos.y - ctx.mouse.sy;
          const mdist = Math.hypot(mdx, mdy) || 1;
          const minf = Math.exp(-Math.pow(mdist / params.mouseRadius, 2) * 2) * params.mouseStrength * 26;
          pos = { x: pos.x + (mdx / mdist) * minf, y: pos.y + (mdy / mdist) * minf };
        }
        pts.push(pos);
      }

      const grad = c.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
      grad.addColorStop(0, oklchToCss(oklchWithAlpha(lineColorB, params.opacity * strand.opacityMul)));
      grad.addColorStop(1, oklchToCss(oklchWithAlpha(lineColorA, params.opacity * strand.opacityMul * 0.7)));
      c.strokeStyle = grad;
      c.lineWidth = Math.max(0.15, params.thickness * depthScale);
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const mx = (pts[i - 1].x + pts[i].x) / 2, my = (pts[i - 1].y + pts[i].y) / 2;
        c.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, mx, my);
      }
      c.stroke();
    }
  },
};
