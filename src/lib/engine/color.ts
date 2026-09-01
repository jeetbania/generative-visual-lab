/**
 * ColorEngine — a generative atmospheric color model, not a swatch picker.
 *
 * Given ANY base color, this derives a coherent set of roles (ambient,
 * atmosphere, focal, transition, accent, glow) using OKLCH relationships —
 * hue offsets, lightness/chroma deltas — rather than sampling or hardcoding
 * fixed palettes. A "TimeMode" is a *recipe* of those relationships, so the
 * same base color produces a completely different atmosphere per mode while
 * staying built from the same base.
 */

import { SeededRandom } from "./random";

// ---------------------------------------------------------------------------
// Color space conversion: sRGB <-> linear <-> OKLab <-> OKLCH
// (Björn Ottosson's OKLab, https://bottosson.github.io/posts/oklab/)
// ---------------------------------------------------------------------------

export interface Oklch {
  l: number; // 0..1
  c: number; // 0..~0.4
  h: number; // degrees 0..360
  alpha?: number;
}

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const cs = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, cs)) * 255);
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToOklch(r: number, g: number, b: number, alpha = 1): Oklch {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l3 = Math.cbrt(l_), m3 = Math.cbrt(m_), s3 = Math.cbrt(s_);
  const L = 0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3;
  const a = 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3;
  const bb = 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3;
  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: H, alpha };
}

export function oklchToRgb(o: Oklch): [number, number, number] {
  const hRad = (o.h * Math.PI) / 180;
  const a = Math.cos(hRad) * o.c;
  const b = Math.sin(hRad) * o.c;
  const l_ = o.l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = o.l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = o.l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ * l_ * l_, m3 = m_ * m_ * m_, s3 = s_ * s_ * s_;
  const lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex);
  return rgbToOklch(r, g, b);
}

export function oklchToHex(o: Oklch): string {
  const [r, g, b] = oklchToRgb(o);
  return rgbToHex(r, g, b);
}

export function oklchToCss(o: Oklch): string {
  const a = o.alpha ?? 1;
  return `oklch(${(o.l * 100).toFixed(2)}% ${o.c.toFixed(4)} ${o.h.toFixed(2)} / ${a})`;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function normHue(h: number): number {
  let x = h % 360;
  if (x < 0) x += 360;
  return x;
}

/** Perceptually-even mix of two OKLCH colors (shortest hue path). */
export function mixOklch(a: Oklch, b: Oklch, t: number): Oklch {
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return {
    l: a.l + (b.l - a.l) * t,
    c: a.c + (b.c - a.c) * t,
    h: normHue(a.h + dh * t),
    alpha: (a.alpha ?? 1) + ((b.alpha ?? 1) - (a.alpha ?? 1)) * t,
  };
}

/** Sample N perceptual steps between two colors — used to feed canvas-native
 *  gradients (which interpolate in sRGB) extra stops so they read as smooth
 *  OKLCH transitions instead of muddying through the middle of the wheel. */
export function oklchSteps(a: Oklch, b: Oklch, steps: number): Oklch[] {
  const out: Oklch[] = [];
  for (let i = 0; i <= steps; i++) out.push(mixOklch(a, b, i / steps));
  return out;
}

// ---------------------------------------------------------------------------
// Palette model
// ---------------------------------------------------------------------------

export interface Palette {
  base: Oklch; // the untouched input color (background)
  background: Oklch; // background, mode-adjusted
  ambient: Oklch; // dominant environmental tone
  atmosphere: Oklch; // secondary atmospheric tone (analogous to ambient)
  focal: Oklch; // warm/cool focal accent (illumination)
  transition: Oklch; // soft blend between ambient and focal
  accent: Oklch; // small bright/dark highlight
  glow: Oklch; // extreme-lightness bloom color derived from focal
  modeName: string;
}

export interface AtmosphereRecipe {
  id: string;
  name: string;
  /** Lightness target for ambient, independent of base (this is what makes
   *  night/day genuinely different atmospheres rather than a hue swap). */
  ambientLightness: number;
  ambientChroma: number;
  ambientHueOffset: number; // relative to base hue
  atmosphereHueOffset: number;
  atmosphereLightnessDelta: number;
  focalLightness: number;
  focalChroma: number;
  focalHueOffset: number; // relative to base hue — the "what illuminates it" color
  backgroundLightnessDelta: number;
  backgroundChromaDelta: number;
  contrast: number; // 0..1, widens focal/ambient lightness gap
  glowIntensity: number; // 0..1
  haze: number; // 0..1, how much atmosphere bleeds over everything
}

// Each recipe encodes *relationships*, not fixed hexes — "cool ambient +
// warm low-angle focal light + soft neutral transition" etc. per the brief.
export const TIME_MODES: AtmosphereRecipe[] = [
  {
    id: "pre-dawn", name: "Pre-dawn",
    ambientLightness: 0.32, ambientChroma: 0.05, ambientHueOffset: 20,
    atmosphereHueOffset: -40, atmosphereLightnessDelta: 0.08,
    focalLightness: 0.55, focalChroma: 0.09, focalHueOffset: 190,
    backgroundLightnessDelta: -0.02, backgroundChromaDelta: 0.01,
    contrast: 0.35, glowIntensity: 0.3, haze: 0.55,
  },
  {
    id: "sunrise", name: "Sunrise",
    ambientLightness: 0.78, ambientChroma: 0.045, ambientHueOffset: -25,
    atmosphereHueOffset: 55, atmosphereLightnessDelta: 0.02,
    focalLightness: 0.78, focalChroma: 0.14, focalHueOffset: 145,
    backgroundLightnessDelta: 0.03, backgroundChromaDelta: 0.005,
    contrast: 0.4, glowIntensity: 0.55, haze: 0.45,
  },
  {
    id: "morning", name: "Morning",
    ambientLightness: 0.83, ambientChroma: 0.035, ambientHueOffset: -35,
    atmosphereHueOffset: 10, atmosphereLightnessDelta: 0.04,
    focalLightness: 0.82, focalChroma: 0.11, focalHueOffset: 165,
    backgroundLightnessDelta: 0.04, backgroundChromaDelta: 0,
    contrast: 0.32, glowIntensity: 0.4, haze: 0.3,
  },
  {
    id: "day", name: "Day",
    ambientLightness: 0.86, ambientChroma: 0.03, ambientHueOffset: -30,
    atmosphereHueOffset: -10, atmosphereLightnessDelta: 0.02,
    focalLightness: 0.9, focalChroma: 0.05, focalHueOffset: 0,
    backgroundLightnessDelta: 0.05, backgroundChromaDelta: -0.005,
    contrast: 0.2, glowIntensity: 0.2, haze: 0.15,
  },
  {
    id: "golden-hour", name: "Golden Hour",
    ambientLightness: 0.7, ambientChroma: 0.06, ambientHueOffset: -20,
    atmosphereHueOffset: 60, atmosphereLightnessDelta: -0.05,
    focalLightness: 0.75, focalChroma: 0.17, focalHueOffset: 150,
    backgroundLightnessDelta: -0.01, backgroundChromaDelta: 0.02,
    contrast: 0.55, glowIntensity: 0.7, haze: 0.4,
  },
  {
    id: "dusk", name: "Dusk",
    ambientLightness: 0.5, ambientChroma: 0.07, ambientHueOffset: 40,
    atmosphereHueOffset: -60, atmosphereLightnessDelta: 0.1,
    focalLightness: 0.62, focalChroma: 0.13, focalHueOffset: 170,
    backgroundLightnessDelta: -0.06, backgroundChromaDelta: 0.02,
    contrast: 0.45, glowIntensity: 0.5, haze: 0.6,
  },
  {
    id: "sunset", name: "Sunset",
    ambientLightness: 0.42, ambientChroma: 0.08, ambientHueOffset: 45,
    atmosphereHueOffset: -35, atmosphereLightnessDelta: 0.12,
    focalLightness: 0.68, focalChroma: 0.19, focalHueOffset: 160,
    backgroundLightnessDelta: -0.08, backgroundChromaDelta: 0.03,
    contrast: 0.6, glowIntensity: 0.75, haze: 0.5,
  },
  {
    id: "blue-hour", name: "Blue Hour",
    ambientLightness: 0.24, ambientChroma: 0.06, ambientHueOffset: 15,
    atmosphereHueOffset: -25, atmosphereLightnessDelta: 0.06,
    focalLightness: 0.5, focalChroma: 0.1, focalHueOffset: 195,
    backgroundLightnessDelta: -0.12, backgroundChromaDelta: 0.015,
    contrast: 0.4, glowIntensity: 0.35, haze: 0.65,
  },
  {
    id: "night", name: "Night",
    ambientLightness: 0.14, ambientChroma: 0.045, ambientHueOffset: 10,
    atmosphereHueOffset: -30, atmosphereLightnessDelta: 0.05,
    focalLightness: 0.42, focalChroma: 0.12, focalHueOffset: 205,
    backgroundLightnessDelta: -0.15, backgroundChromaDelta: 0.01,
    contrast: 0.3, glowIntensity: 0.25, haze: 0.7,
  },
];

export function findMode(id: string): AtmosphereRecipe {
  return TIME_MODES.find((m) => m.id === id) ?? TIME_MODES[3];
}

/**
 * Generate a full atmospheric palette from a base color + recipe.
 * `jitter` (0..1) adds small per-call randomized variation (via rng) so
 * repeated generations from the same base+mode aren't bit-identical when the
 * caller wants "explore around this" behavior; pass rng=undefined for a
 * fully deterministic result.
 */
export function generatePalette(baseHex: string, mode: AtmosphereRecipe, rng?: SeededRandom, jitter = 0): Palette {
  const base = hexToOklch(baseHex);
  const j = (spread: number) => (rng ? rng.gaussian() * jitter * spread : 0);

  const ambient: Oklch = {
    l: clamp(mode.ambientLightness + j(0.03), 0.03, 0.98),
    c: clamp(mode.ambientChroma + j(0.01), 0, 0.12),
    h: normHue(base.h + mode.ambientHueOffset + j(6)),
  };

  const atmosphere: Oklch = {
    l: clamp(ambient.l + mode.atmosphereLightnessDelta, 0.03, 0.98),
    c: clamp(mode.ambientChroma * 0.9 + j(0.01), 0, 0.12),
    h: normHue(base.h + mode.atmosphereHueOffset + j(6)),
  };

  const contrastLift = (mode.contrast - 0.4) * 0.2;
  const focal: Oklch = {
    l: clamp(mode.focalLightness + contrastLift + j(0.02), 0.05, 0.97),
    c: clamp(mode.focalChroma + mode.contrast * 0.05 + j(0.015), 0, 0.28),
    h: normHue(base.h + mode.focalHueOffset + j(8)),
  };

  const transition = mixOklch(ambient, focal, 0.5);
  transition.c = clamp(transition.c * 0.7, 0, 0.2);

  const background: Oklch = {
    l: clamp(base.l + mode.backgroundLightnessDelta, 0.02, 0.99),
    c: clamp(base.c + mode.backgroundChromaDelta, 0, 0.1),
    h: normHue(base.h + mode.ambientHueOffset * 0.15),
  };

  const accentToward = background.l > 0.5 ? 0.12 : 0.9;
  const accent: Oklch = {
    l: clamp(mixOklch(focal, { l: accentToward, c: 0.02, h: focal.h }, 0.5).l, 0.05, 0.97),
    c: clamp(focal.c * 0.65, 0, 0.22),
    h: focal.h,
  };

  const glowTargetL = background.l > 0.5 ? 0.97 : 0.85;
  const glow: Oklch = {
    l: clamp(mixOklch(focal, { l: glowTargetL, c: 0, h: focal.h }, 0.6 + mode.glowIntensity * 0.2).l, 0.4, 0.99),
    c: clamp(focal.c * (0.5 + mode.glowIntensity * 0.4), 0, 0.18),
    h: focal.h,
    alpha: mode.glowIntensity,
  };

  return { base, background, ambient, atmosphere, focal, transition, accent, glow, modeName: mode.name };
}

/** Infers a reasonable default time mode purely from the base color's
 *  lightness, so picking a base color alone already looks intentional. */
export function inferModeForBase(baseHex: string): AtmosphereRecipe {
  const { l } = hexToOklch(baseHex);
  if (l > 0.88) return findMode("day");
  if (l > 0.7) return findMode("morning");
  if (l > 0.45) return findMode("golden-hour");
  if (l > 0.25) return findMode("dusk");
  if (l > 0.12) return findMode("blue-hour");
  return findMode("night");
}

/** "Generate beautiful palette" — a tasteful random base + mode, capped
 *  chroma to avoid the neon/cheap look the brief explicitly warns against. */
export function randomPalette(rng: SeededRandom): { baseHex: string; mode: AtmosphereRecipe; palette: Palette } {
  const lightBias = rng.chance(0.55);
  const l = lightBias ? rng.range(0.9, 0.98) : rng.range(0.04, 0.16);
  const c = rng.range(0, 0.02);
  const h = rng.range(0, 360);
  const baseHex = oklchToHex({ l, c, h });
  const mode = rng.pick(TIME_MODES);
  const palette = generatePalette(baseHex, mode, rng, 0.4);
  return { baseHex, mode, palette };
}

/** Interpolates all palette roles between two full palettes — used for the
 *  slow, smooth "auto cycle" through time modes. */
export function mixPalette(a: Palette, b: Palette, t: number): Palette {
  return {
    base: mixOklch(a.base, b.base, t),
    background: mixOklch(a.background, b.background, t),
    ambient: mixOklch(a.ambient, b.ambient, t),
    atmosphere: mixOklch(a.atmosphere, b.atmosphere, t),
    focal: mixOklch(a.focal, b.focal, t),
    transition: mixOklch(a.transition, b.transition, t),
    accent: mixOklch(a.accent, b.accent, t),
    glow: mixOklch(a.glow, b.glow, t),
    modeName: t < 0.5 ? a.modeName : b.modeName,
  };
}

export function oklchWithAlpha(o: Oklch, alpha: number): Oklch {
  return { ...o, alpha };
}

/**
 * Sweeps across the palette's atmospheric roles (ambient -> transition ->
 * focal -> transition -> atmosphere) at position t (0..1). Shared by any
 * generator that wants to map a spatial or temporal coordinate onto the
 * atmosphere's color story — longitude/latitude on the globe, band index in
 * Aurora Field, sweep angle, etc.
 */
export function paletteSweep(palette: Palette, t: number): Oklch {
  const stops = [palette.ambient, palette.transition, palette.focal, palette.transition, palette.atmosphere];
  const tt = Math.max(0, Math.min(1, t));
  const scaled = tt * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  return mixOklch(stops[i], stops[i + 1], scaled - i);
}

/**
 * `ambient` / `atmosphere` / `focal` / `glow` are deliberately close in
 * lightness to the background — that's what makes the atmosphere soft. But
 * that means using them directly as a FOREGROUND ink color (a strand, a
 * particle) can vanish against the background in light or dark modes. This
 * pushes a color's lightness away from the background by at least `minDelta`
 * while preserving its hue, so foreground geometry always reads clearly.
 */
export function ensureContrast(color: Oklch, background: Oklch, minDelta = 0.3): Oklch {
  const diff = color.l - background.l;
  if (Math.abs(diff) >= minDelta) return color;
  const pushDir = background.l > 0.5 ? -1 : 1;
  const l = clamp(background.l + pushDir * minDelta, 0.04, 0.97);
  return { ...color, l, c: Math.max(color.c, 0.035) };
}
