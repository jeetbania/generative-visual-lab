/**
 * Core contracts every generator conforms to. New effects only need to
 * implement this interface to appear in the library, get inspector controls
 * for free (via `fields`), and participate in seed/mutate/export.
 */

import { SeededRandom } from "./random";
import { NoiseEngine } from "./noise";
import { Palette } from "./color";
import { PointerState } from "./interaction";

export type Quality = "draft" | "balanced" | "high" | "ultra";
export type Depth = "off" | "subtle" | "strong";

export interface GeoAnchor {
  id: string;
  lon: number;
  lat: number;
  label: string;
  sublabel?: string;
  color?: string;
  size: number;
  visible: boolean;
}

export interface GeoRoute {
  id: string;
  fromId: string;
  toId: string;
  curveType: "straight" | "arc" | "great-circle";
  style: "solid" | "dotted" | "particle";
  thickness: number;
  opacity: number;
  speed: number;
  curvature: number;
  particleCount: number;
  direction: 1 | -1;
  glow: number;
}

export interface GeoState {
  anchors: GeoAnchor[];
  routes: GeoRoute[];
  pendingAnchorId: string | null;
}

export interface EffectContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  time: number; // seconds, respects play/pause and speed
  dt: number; // seconds since last frame (simulation time, not wall clock)
  mouse: PointerState;
  interactionEnabled: boolean;
  rng: SeededRandom;
  noise: NoiseEngine;
  palette: Palette;
  depth: Depth;
  quality: Quality;
  /** Populated only for generators that opt into anchor/route interaction
   *  (currently Particle Globe). Absent for everything else. */
  geo?: GeoState;
  /** Samples the SAME atmosphere the background just painted, at a
   *  0..1-normalized canvas point — the "particles inherit the color of the
   *  gradient underneath them" primitive. Set by paintFrame before update/
   *  render run; falls back to the raw palette focal color if absent. */
  sampleAtmosphere?: (xNorm: number, yNorm: number) => import("./color").Oklch;
}

export type FieldType = "slider" | "toggle" | "select" | "color" | "text";

export interface ParamField {
  key: string;
  label: string;
  section: string; // groups into inspector folders, e.g. "Field", "Particles"
  type: FieldType;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  default: number | boolean | string;
  /** excluded from the numeric-mutate pool (e.g. counts that shouldn't jitter) */
  noMutate?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EffectParams = Record<string, any>;

export interface EffectDefinition<P extends EffectParams = EffectParams, S = unknown> {
  id: string;
  name: string;
  category: "FIELDS" | "PARTICLES" | "GEOMETRY" | "ATMOSPHERE" | "MAPS" | "TYPOGRAPHY" | "EXPERIMENTAL";
  description: string;
  fields: ParamField[];
  defaultParams: P;
  /** where the generator's geometric focus sits, 0..1 — feeds the background
   *  focal glow so color always supports geometry. Receives live state too,
   *  so a generator can make the atmosphere's glow FOLLOW a moving attractor
   *  instead of sitting at a fixed point (composable Atmosphere <- Field). */
  focalPoint: (params: P, state?: S) => { x: number; y: number };
  createState: (params: P, ctx: EffectContext) => S;
  update: (state: S, params: P, ctx: EffectContext) => void;
  render: (state: S, params: P, ctx: EffectContext) => void;
  renderSVG?: (state: S, params: P, ctx: EffectContext) => string;
  /** Opt-in click interaction (currently: placing/connecting map anchors).
   *  xDevice/yDevice are in the same device-pixel space as EffectContext.
   *  Returns what happened so the host can dispatch it into shared state —
   *  the effect itself never touches React state directly. */
  handleClick?: (params: P, xDevice: number, yDevice: number, ctx: EffectContext, state: S) => GeoClickResult | void;
}

export type GeoClickResult = { kind: "anchor"; lon: number; lat: number } | { kind: "select"; anchorId: string };

export function fieldDefaults<P extends EffectParams>(fields: ParamField[]): P {
  const out: EffectParams = {};
  for (const f of fields) out[f.key] = f.default;
  return out as P;
}

export function numericRanges(fields: ParamField[]): Partial<Record<string, [number, number]>> {
  const out: Partial<Record<string, [number, number]>> = {};
  for (const f of fields) {
    if (f.type === "slider" && !f.noMutate && f.min !== undefined && f.max !== undefined) {
      out[f.key] = [f.min, f.max];
    }
  }
  return out;
}
