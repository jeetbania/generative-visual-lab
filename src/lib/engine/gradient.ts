/**
 * GradientEngine — atmospheric field rendering.
 *
 * Turns a Palette into a spatial composition: a dominant ambient wash, a
 * secondary atmospheric tint from an offset direction, a focal glow that can
 * sit anywhere in the frame, a noise-displaced haze so nothing reads as a
 * perfect CSS gradient, and fine grain. This is shared by every effect's
 * background so "the same geometry with a different atmosphere" is a single
 * palette swap away.
 */

import { NoiseEngine } from "./noise";
import { Oklch, Palette, mixOklch, oklchSteps, oklchToCss, oklchWithAlpha } from "./color";

export interface AtmosphereOptions {
  /** focal point in 0..1 canvas-relative coordinates */
  focalX: number;
  focalY: number;
  /** secondary "sky" light direction, 0..1 */
  ambientX: number;
  ambientY: number;
  haze: number; // 0..1
  contrast: number; // 0..1
  glowIntensity: number; // 0..1
  grain: number; // 0..1
  time: number;
  noiseScale?: number;
  noiseDrift?: number;
}

function addOklchStops(g: CanvasGradient, a: Oklch, b: Oklch, steps: number, from = 0, to = 1) {
  const cols = oklchSteps(a, b, steps);
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps;
    g.addColorStop(Math.min(1, Math.max(0, t)), oklchToCss(cols[i]));
  }
}

let grainTile: HTMLCanvasElement | null = null;
function getGrainTile(noise: NoiseEngine): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.random() * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

export class GradientEngine {
  private noise: NoiseEngine;

  constructor(seed: number) {
    this.noise = new NoiseEngine(seed);
  }

  reseed(seed: number) {
    this.noise = new NoiseEngine(seed);
  }

  /**
   * Analytic approximation of what `paintAtmosphere` would put at a given
   * point — without re-rendering the canvas. This is the "particles inherit
   * the color of the gradient underneath them" primitive: any effect can
   * sample the SAME atmosphere its background painted and tint its own
   * geometry with it, so foreground and background always cohere.
   */
  sampleColor(palette: Palette, xNorm: number, yNorm: number, w: number, h: number, opts: AtmosphereOptions): Oklch {
    const diag = Math.hypot(w, h);
    const focalR = diag * (0.32 + opts.contrast * 0.28 + opts.glowIntensity * 0.15);
    const dFocal = Math.hypot((xNorm - opts.focalX) * w, (yNorm - opts.focalY) * h);
    const tFocal = Math.max(0, Math.min(1, 1 - dFocal / focalR));
    const ambR = diag * (0.9 + opts.haze * 0.4);
    const dAmb = Math.hypot((xNorm - opts.ambientX) * w, (yNorm - opts.ambientY) * h);
    const tAmb = Math.max(0, Math.min(1, 1 - dAmb / ambR)) * 0.55 * (0.5 + opts.haze * 0.5);
    let color = palette.background;
    color = mixOklch(color, palette.ambient, tAmb);
    color = mixOklch(color, palette.focal, tFocal * 0.8);
    return color;
  }

  paintAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, palette: Palette, opts: AtmosphereOptions) {
    const { focalX, focalY, ambientX, ambientY, haze, contrast, glowIntensity, grain, time } = opts;
    const noiseScale = opts.noiseScale ?? 1.6;
    const noiseDrift = opts.noiseDrift ?? 0.02;

    // base fill
    ctx.fillStyle = oklchToCss(palette.background);
    ctx.fillRect(0, 0, w, h);

    // 1. Ambient wash — large soft gradient from an offset corner, low chroma.
    ctx.save();
    const ambR = Math.hypot(w, h) * (0.9 + haze * 0.4);
    const ag = ctx.createRadialGradient(ambientX * w, ambientY * h, 0, ambientX * w, ambientY * h, ambR);
    addOklchStops(ag, oklchWithAlpha(palette.ambient, 0.55 * (0.5 + haze * 0.5)), oklchWithAlpha(palette.atmosphere, 0), 6);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = ag;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 2. Focal glow — the warm/cool localized illumination, always positioned
    // where the generator's geometry actually converges.
    ctx.save();
    const focalR = Math.hypot(w, h) * (0.32 + contrast * 0.28 + glowIntensity * 0.15);
    const fg = ctx.createRadialGradient(focalX * w, focalY * h, 0, focalX * w, focalY * h, focalR);
    addOklchStops(fg, oklchWithAlpha(palette.focal, 0.65 + glowIntensity * 0.25), oklchWithAlpha(palette.transition, 0), 8, 0, 0.65);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 3. Organic haze — low-frequency noise-modulated blobs so the field
    // reads as atmospheric rather than a mathematically clean gradient.
    if (haze > 0.02) {
      ctx.save();
      const blobCount = 5;
      for (let i = 0; i < blobCount; i++) {
        const nx = this.noise.fbm2(i * 3.1 + time * noiseDrift, i * 1.7, 3);
        const ny = this.noise.fbm2(i * 1.3, i * 2.9 + time * noiseDrift, 3);
        const bx = (0.5 + nx * 0.42) * w;
        const by = (0.4 + ny * 0.42) * h;
        const r = (Math.hypot(w, h) * (0.16 + 0.1 * ((i % 3) / 2))) * noiseScale * 0.5;
        const useFocal = i % 2 === 0;
        const col = useFocal ? palette.transition : palette.atmosphere;
        const bg = ctx.createRadialGradient(bx, by, 0, bx, by, r);
        bg.addColorStop(0, oklchToCss(oklchWithAlpha(col, haze * 0.16)));
        bg.addColorStop(1, oklchToCss(oklchWithAlpha(col, 0)));
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }

    // 4. Grain — very subtle, breaks up banding, gives a premium print feel.
    if (grain > 0.01) {
      ctx.save();
      ctx.globalAlpha = grain * 0.05;
      ctx.globalCompositeOperation = "overlay";
      const tile = getGrainTile(this.noise);
      const pattern = ctx.createPattern(tile, "repeat");
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }
  }
}
