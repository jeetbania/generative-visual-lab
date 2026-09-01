import { Depth, EffectParams, GeoAnchor, GeoRoute, Quality } from "../engine/types";

export type { Depth, Quality, GeoAnchor, GeoRoute } from "../engine/types";
import { EFFECTS, findEffect } from "../effects/registry";
import { randomSeed } from "../engine/random";
import { inferModeForBase } from "../engine/color";

export type AspectPreset = "1:1" | "4:5" | "16:9" | "9:16" | "21:9" | "custom";

export interface CompositionState {
  width: number;
  height: number;
  aspect: AspectPreset;
}

export interface ProjectState {
  /** bumped only on structural loads (preset/project import) so inspector
   *  panels know to remount and pick up the new defaults. */
  revision: number;
  effectId: string;
  paramsByEffect: Record<string, EffectParams>;
  seed: number;
  baseColor: string;
  modeId: string; // TimeMode id or "auto"
  autoCycle: boolean;
  autoCycleSpeed: number; // modes per minute
  composition: CompositionState;
  depth: Depth;
  quality: Quality;
  interactionEnabled: boolean;
  speed: number;
  playing: boolean;
  fps: 24 | 30 | 60;
  transparentBackground: boolean;
  haze: number;
  contrast: number;
  glowIntensity: number;
  grain: number;
  geoAnchors: GeoAnchor[];
  geoRoutes: GeoRoute[];
  geoPendingAnchorId: string | null;
}

export function defaultParamsFor(effectId: string): EffectParams {
  return { ...findEffect(effectId).defaultParams };
}

export function defaultProject(): ProjectState {
  const paramsByEffect: Record<string, EffectParams> = {};
  for (const e of EFFECTS) paramsByEffect[e.id] = { ...e.defaultParams };
  return {
    revision: 0,
    effectId: EFFECTS[0].id,
    paramsByEffect,
    seed: 18372,
    baseColor: "#FDFCF9",
    modeId: inferModeForBase("#FDFCF9").id,
    autoCycle: false,
    autoCycleSpeed: 0.5,
    composition: { width: 1600, height: 900, aspect: "16:9" },
    depth: "subtle",
    quality: "high",
    interactionEnabled: true,
    speed: 1,
    playing: true,
    fps: 60,
    transparentBackground: false,
    haze: 0.5,
    contrast: 0.4,
    glowIntensity: 0.5,
    grain: 0.3,
    geoAnchors: [],
    geoRoutes: [],
    geoPendingAnchorId: null,
  };
}

export function newSeed(): number {
  return randomSeed();
}

export function serializeProject(p: ProjectState): string {
  return JSON.stringify(p, null, 2);
}

export function deserializeProject(json: string): ProjectState | null {
  try {
    const parsed = JSON.parse(json);
    const base = defaultProject();
    return { ...base, ...parsed, composition: { ...base.composition, ...parsed.composition } };
  } catch {
    return null;
  }
}

export const ASPECT_SIZES: Record<AspectPreset, [number, number] | null> = {
  "1:1": [1200, 1200],
  "4:5": [1200, 1500],
  "16:9": [1600, 900],
  "9:16": [900, 1600],
  "21:9": [1800, 771],
  custom: null,
};
