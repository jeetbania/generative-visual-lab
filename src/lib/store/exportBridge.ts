/**
 * A tiny imperative bridge so the export panel (in the Inspector) can pull a
 * snapshot of "what the canvas is currently showing" — effect, params,
 * palette, seed — without threading the live render engines through React
 * state (which updates every animation frame).
 */
import type { EffectDefinition, EffectParams, Depth, Quality } from "../engine/types";
import type { Palette } from "../engine/color";

export interface ExportSnapshot {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effect: EffectDefinition<any, any>;
  params: EffectParams;
  palette: Palette;
  seed: number;
  depth: Depth;
  quality: Quality;
  time: number;
  speed: number;
}

type Provider = () => ExportSnapshot;

let provider: Provider | null = null;

export function registerExportProvider(p: Provider) {
  provider = p;
}
export function unregisterExportProvider(p: Provider) {
  if (provider === p) provider = null;
}
export function getExportSnapshot(): ExportSnapshot | null {
  return provider ? provider() : null;
}
