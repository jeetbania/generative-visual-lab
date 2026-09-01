/**
 * ExportEngine — renders at the REQUESTED export resolution (never the
 * on-screen canvas size) by building a fresh offscreen canvas + effect state
 * and running the same paintFrame pipeline the live preview uses.
 */

import { GradientEngine } from "./gradient";
import { NoiseEngine } from "./noise";
import { SeededRandom } from "./random";
import { Palette } from "./color";
import { Depth, EffectContext, EffectDefinition, Quality } from "./types";
import { paintFrame, CompositionSettings } from "./renderFrame";
import { PointerState } from "./interaction";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const IDLE_MOUSE: PointerState = { x: 0, y: 0, vx: 0, vy: 0, active: false, down: false, sx: 0, sy: 0 };

export interface RenderJobOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effect: EffectDefinition<any, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any;
  palette: Palette;
  seed: number;
  width: number;
  height: number;
  time: number;
  depth: Depth;
  quality: Quality;
  comp: CompositionSettings;
}

function buildContext(canvas: HTMLCanvasElement, opts: RenderJobOptions, noise: NoiseEngine, rng: SeededRandom, dt: number): EffectContext {
  const ctx = canvas.getContext("2d")!;
  return {
    ctx, width: opts.width, height: opts.height, dpr: 1,
    time: opts.time, dt,
    mouse: IDLE_MOUSE, interactionEnabled: false,
    rng, noise, palette: opts.palette, depth: opts.depth, quality: opts.quality,
  };
}

export function renderStill(opts: RenderJobOptions): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width; canvas.height = opts.height;
  const noise = new NoiseEngine(opts.seed);
  const rng = new SeededRandom(opts.seed);
  const gradientEngine = new GradientEngine(opts.seed);
  const effectCtx = buildContext(canvas, opts, noise, rng, 1 / 60);
  const state = opts.effect.createState(opts.params, effectCtx);
  // step a few frames so time-dependent motion (drift, trails) looks settled
  for (let i = 0; i < 30; i++) {
    const stepCtx = { ...effectCtx, time: (opts.time - 0.5) + (i / 30) * 0.5 };
    paintFrame(gradientEngine, opts.effect, state, opts.params, stepCtx, opts.palette, opts.comp);
  }
  return canvas;
}

export async function exportPNG(opts: RenderJobOptions, filename: string) {
  const canvas = renderStill(opts);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  if (blob) downloadBlob(blob, filename);
}

export function exportSVG(opts: RenderJobOptions, filename: string): boolean {
  if (!opts.effect.renderSVG) return false;
  const noise = new NoiseEngine(opts.seed);
  const rng = new SeededRandom(opts.seed);
  const canvas = document.createElement("canvas");
  canvas.width = opts.width; canvas.height = opts.height;
  const effectCtx = buildContext(canvas, opts, noise, rng, 1 / 60);
  const state = opts.effect.createState(opts.params, effectCtx);
  effectCtx.time = opts.time;
  opts.effect.update(state, opts.params, effectCtx);
  const svg = opts.effect.renderSVG(state, opts.params, effectCtx);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  downloadBlob(blob, filename);
  return true;
}

export interface VideoExportOptions extends RenderJobOptions {
  fps: 24 | 30 | 60;
  durationSeconds: number;
  speed: number;
  onProgress?: (t: number) => void;
}

/**
 * WebM export via MediaRecorder + canvas.captureStream, paced to the
 * requested fps. Renders offscreen at the requested resolution regardless of
 * on-screen preview size. NOTE: this produces a genuine .webm container, not
 * an MP4 — true MP4 encoding needs a client-side encoder (e.g. ffmpeg.wasm)
 * which isn't wired in yet.
 */
export async function exportVideoWebM(opts: VideoExportOptions, filename: string): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width; canvas.height = opts.height;
  canvas.style.position = "fixed";
  canvas.style.left = "-99999px";
  document.body.appendChild(canvas);

  const noise = new NoiseEngine(opts.seed);
  const rng = new SeededRandom(opts.seed);
  const gradientEngine = new GradientEngine(opts.seed);
  const effectCtx = buildContext(canvas, opts, noise, rng, 1 / opts.fps);
  const state = opts.effect.createState(opts.params, effectCtx);

  const stream = canvas.captureStream(opts.fps);
  const mimeCandidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const totalFrames = Math.round(opts.durationSeconds * opts.fps);
  const frameIntervalMs = 1000 / opts.fps;

  const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start();

  for (let i = 0; i < totalFrames; i++) {
    const t0 = performance.now();
    const simTime = (i / opts.fps) * opts.speed;
    const stepCtx = { ...effectCtx, time: simTime, dt: 1 / opts.fps };
    paintFrame(gradientEngine, opts.effect, state, opts.params, stepCtx, opts.palette, opts.comp);
    opts.onProgress?.(i / totalFrames);
    const elapsed = performance.now() - t0;
    const wait = Math.max(0, frameIntervalMs - elapsed);
    await new Promise((r) => setTimeout(r, wait));
  }

  await new Promise((r) => setTimeout(r, 150));
  recorder.stop();
  await done;
  document.body.removeChild(canvas);

  const blob = new Blob(chunks, { type: "video/webm" });
  downloadBlob(blob, filename);
}
