/**
 * Shared paint pipeline: background atmosphere -> effect update -> effect
 * render. Used identically by the live preview loop and by the export
 * pipeline so exported frames are pixel-for-pixel what the canvas would show.
 */

import { GradientEngine } from "./gradient";
import { EffectContext, EffectDefinition } from "./types";
import { Palette } from "./color";

export interface CompositionSettings {
  haze: number;
  contrast: number;
  glowIntensity: number;
  grain: number;
  transparentBackground?: boolean;
}

export function paintFrame(
  gradientEngine: GradientEngine,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effect: EffectDefinition<any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any,
  effectCtx: EffectContext,
  palette: Palette,
  comp: CompositionSettings,
) {
  const { ctx, width, height } = effectCtx;
  ctx.clearRect(0, 0, width, height);

  const focal = effect.focalPoint(params, state);
  const atmosphereOpts = {
    focalX: focal.x, focalY: focal.y,
    ambientX: 1 - focal.x * 0.6, ambientY: Math.max(0, focal.y - 0.5),
    haze: comp.haze, contrast: comp.contrast, glowIntensity: comp.glowIntensity,
    grain: comp.grain, time: effectCtx.time,
  };
  if (!comp.transparentBackground) {
    gradientEngine.paintAtmosphere(ctx, width, height, palette, atmosphereOpts);
  }
  effectCtx.sampleAtmosphere = (xNorm, yNorm) => gradientEngine.sampleColor(palette, xNorm, yNorm, width, height, atmosphereOpts);

  effect.update(state, params, effectCtx);
  effect.render(state, params, effectCtx);
}
