"use client";

import { useEffect, useRef } from "react";
import { useStudio } from "@/lib/store/StudioProvider";
import { findEffect } from "@/lib/effects/registry";
import { NoiseEngine } from "@/lib/engine/noise";
import { GradientEngine } from "@/lib/engine/gradient";
import { SeededRandom } from "@/lib/engine/random";
import { InteractionEngine } from "@/lib/engine/interaction";
import { generatePalette, findMode, mixPalette, Palette, TIME_MODES } from "@/lib/engine/color";
import { paintFrame } from "@/lib/engine/renderFrame";
import { EffectContext } from "@/lib/engine/types";
import { registerExportProvider, unregisterExportProvider } from "@/lib/store/exportBridge";
import { ProjectState } from "@/lib/store/project";

interface Runtime {
  effectId: string;
  seed: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  rng: SeededRandom;
  noise: NoiseEngine;
  gradient: GradientEngine;
}

export default function Canvas({ presentation }: { presentation: boolean }) {
  const { state, dispatch } = useStudio();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<ProjectState>(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const runtimeRef = useRef<Runtime | null>(null);
  const interactionRef = useRef<InteractionEngine | null>(null);
  const simTimeRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const cyclePosRef = useRef(0);
  const paletteRef = useRef<Palette | null>(null);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ cssW: 0, cssH: 0, dpr: 1 });

  useEffect(() => {
    const interaction = new InteractionEngine();
    interactionRef.current = interaction;
    const canvas = canvasRef.current;
    if (canvas) interaction.attach(canvas);

    // Click detection (down+up within a small movement/time budget) — kept
    // separate from the continuous move tracking above. Effects that opt in
    // via `handleClick` (currently Particle Globe's anchor placement) get a
    // device-space coordinate; everything else simply ignores clicks.
    let downX = 0, downY = 0, downT = 0, down = false;
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; downT = performance.now(); down = true; };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      const elapsed = performance.now() - downT;
      if (moved > 6 || elapsed > 500) return;
      const s = stateRef.current;
      const effect = findEffect(s.effectId);
      if (!effect.handleClick || !canvasRef.current) return;
      const rt = runtimeRef.current;
      const palette = paletteRef.current;
      if (!rt || !palette) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const { dpr } = sizeRef.current;
      // Effect-space is CSS pixels (see the `setTransform` in the render
      // loop below) — no dpr multiplication here, just canvas-relative coords.
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const clickCtx: EffectContext = {
        ctx: canvasRef.current.getContext("2d")!, width: rect.width, height: rect.height, dpr,
        time: simTimeRef.current, dt: 0,
        mouse: interaction.state, interactionEnabled: s.interactionEnabled,
        rng: rt.rng, noise: rt.noise, palette, depth: s.depth, quality: s.quality,
        geo: { anchors: s.geoAnchors, routes: s.geoRoutes, pendingAnchorId: s.geoPendingAnchorId },
      };
      const result = effect.handleClick(s.paramsByEffect[s.effectId], clickX, clickY, clickCtx, rt.state);
      if (result?.kind === "anchor") dispatch({ type: "GEO_ADD_ANCHOR", lon: result.lon, lat: result.lat });
      else if (result?.kind === "select") {
        dispatch({
          type: "GEO_SELECT_ANCHOR", anchorId: result.anchorId,
          defaultRoute: { curveType: "arc", style: "arrow", thickness: 1.2, opacity: 0.85, speed: 1, curvature: 0.35, particleCount: 4, direction: 1, glow: 0.4 },
        });
      }
    };
    canvas?.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      interaction.detach();
      canvas?.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize: fit composition aspect ratio inside the available zone, crisp at DPR.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const aspect = state.composition.width / state.composition.height;
      let cssW = rect.width, cssH = rect.width / aspect;
      if (cssH > rect.height) { cssH = rect.height; cssW = rect.height * aspect; }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      sizeRef.current = { cssW, cssH, dpr };
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [state.composition.width, state.composition.height]);

  useEffect(() => {
    function computePalette(s: ProjectState, dt: number): Palette {
      if (s.autoCycle) {
        const len = TIME_MODES.length;
        cyclePosRef.current = (cyclePosRef.current + dt * (s.autoCycleSpeed / 60)) % len;
        const i0 = Math.floor(cyclePosRef.current) % len;
        const i1 = (i0 + 1) % len;
        const frac = cyclePosRef.current - Math.floor(cyclePosRef.current);
        const pa = generatePalette(s.baseColor, TIME_MODES[i0]);
        const pb = generatePalette(s.baseColor, TIME_MODES[i1]);
        return mixPalette(pa, pb, frac);
      }
      return generatePalette(s.baseColor, findMode(s.modeId));
    }

    function frame(ts: number) {
      rafRef.current = requestAnimationFrame(frame);
      const s = stateRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      const last = lastTsRef.current;
      lastTsRef.current = ts;
      const rawDt = last === null ? 1 / 60 : Math.min(0.05, (ts - last) / 1000);
      const dt = rawDt; // wall-clock for palette drift; sim dt scaled by speed below

      if (s.playing) simTimeRef.current += rawDt * s.speed;

      const palette = computePalette(s, dt);
      paletteRef.current = palette;

      const effect = findEffect(s.effectId);
      const rt = runtimeRef.current;
      if (!rt || rt.effectId !== s.effectId || rt.seed !== s.seed) {
        const noise = new NoiseEngine(s.seed);
        const rng = new SeededRandom(s.seed);
        const gradient = new GradientEngine(s.seed);
        const { cssW, cssH, dpr } = sizeRef.current;
        const bootstrapCtx: EffectContext = {
          ctx: ctx2d, width: cssW, height: cssH, dpr,
          time: simTimeRef.current, dt: 1 / 60,
          mouse: interactionRef.current!.state, interactionEnabled: s.interactionEnabled,
          rng, noise, palette, depth: s.depth, quality: s.quality,
        };
        runtimeRef.current = { effectId: s.effectId, seed: s.seed, state: effect.createState(s.paramsByEffect[s.effectId], bootstrapCtx), rng, noise, gradient };
      }
      const runtime = runtimeRef.current!;

      interactionRef.current?.tick(0.15);
      const { cssW, cssH, dpr } = sizeRef.current;
      if (cssW === 0 || cssH === 0) return;

      // Scale the context once so every effect draws in intuitive CSS-pixel
      // units regardless of display density — a "size: 1.5" param means 1.5
      // CSS px whether dpr is 1 or 3, instead of every effect needing to
      // remember to multiply by ctx.dpr itself.
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

      const effectCtx: EffectContext = {
        ctx: ctx2d, width: cssW, height: cssH, dpr,
        time: simTimeRef.current, dt: rawDt * s.speed,
        mouse: interactionRef.current!.state, interactionEnabled: s.interactionEnabled,
        rng: runtime.rng, noise: runtime.noise, palette, depth: s.depth, quality: s.quality,
        geo: { anchors: s.geoAnchors, routes: s.geoRoutes, pendingAnchorId: s.geoPendingAnchorId },
      };

      paintFrame(runtime.gradient, effect, runtime.state, s.paramsByEffect[s.effectId], effectCtx, palette, {
        haze: s.haze, contrast: s.contrast, glowIntensity: s.glowIntensity, grain: s.grain,
        transparentBackground: s.transparentBackground,
      });
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  useEffect(() => {
    const provider = () => {
      const s = stateRef.current;
      return {
        effect: findEffect(s.effectId),
        params: s.paramsByEffect[s.effectId],
        palette: paletteRef.current ?? generatePalette(s.baseColor, findMode(s.modeId)),
        seed: s.seed,
        depth: s.depth,
        quality: s.quality,
        time: simTimeRef.current,
        speed: s.speed,
      };
    };
    registerExportProvider(provider);
    return () => unregisterExportProvider(provider);
  }, []);

  return (
    <div ref={containerRef} className={presentation ? "canvas-zone canvas-zone--presentation" : "canvas-zone"}>
      <canvas ref={canvasRef} className="canvas-surface" />
    </div>
  );
}
