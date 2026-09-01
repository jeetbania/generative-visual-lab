"use client";

import { useState } from "react";
import { getExportSnapshot } from "@/lib/store/exportBridge";
import { exportPNG, exportSVG, exportVideoWebM } from "@/lib/engine/export";
import { useStudio } from "@/lib/store/StudioProvider";

type Format = "png" | "svg" | "webm";
type Scale = 1 | 2 | 4;
type Resolution = "1080p" | "1440p" | "4k";

const RES_HEIGHT: Record<Resolution, number> = { "1080p": 1080, "1440p": 1440, "4k": 2160 };

export default function ExportPanel() {
  const { state } = useStudio();
  const [format, setFormat] = useState<Format>("png");
  const [scale, setScale] = useState<Scale>(2);
  const [transparent, setTransparent] = useState(false);
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [duration, setDuration] = useState(6);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const aspect = state.composition.width / state.composition.height;

  async function handleExport() {
    const snap = getExportSnapshot();
    if (!snap) return;
    setBusy(true);
    setMessage(null);
    try {
      if (format === "png") {
        const width = Math.round(state.composition.width * scale);
        const height = Math.round(state.composition.height * scale);
        await exportPNG({
          effect: snap.effect, params: snap.params, palette: snap.palette, seed: snap.seed,
          width, height, time: snap.time, depth: snap.depth, quality: "ultra",
          comp: { haze: state.haze, contrast: state.contrast, glowIntensity: state.glowIntensity, grain: state.grain, transparentBackground: transparent },
        }, `${snap.effect.id}-${snap.seed}.png`);
      } else if (format === "svg") {
        const width = state.composition.width, height = state.composition.height;
        const ok = exportSVG({
          effect: snap.effect, params: snap.params, palette: snap.palette, seed: snap.seed,
          width, height, time: snap.time, depth: snap.depth, quality: "ultra",
          comp: { haze: state.haze, contrast: state.contrast, glowIntensity: state.glowIntensity, grain: state.grain, transparentBackground: transparent },
        }, `${snap.effect.id}-${snap.seed}.svg`);
        if (!ok) setMessage("This generator doesn't have a vector export yet — try PNG.");
      } else {
        const height = RES_HEIGHT[resolution];
        const width = Math.round(height * aspect);
        await exportVideoWebM({
          effect: snap.effect, params: snap.params, palette: snap.palette, seed: snap.seed,
          width, height, time: snap.time, depth: snap.depth, quality: state.quality,
          comp: { haze: state.haze, contrast: state.contrast, glowIntensity: state.glowIntensity, grain: state.grain, transparentBackground: false },
          fps, durationSeconds: duration, speed: snap.speed,
          onProgress: setProgress,
        }, `${snap.effect.id}-${snap.seed}.webm`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  return (
    <div className="export-panel">
      <div className="export-header">EXPORT</div>
      <div className="export-tabs">
        {(["png", "svg", "webm"] as Format[]).map((f) => (
          <button key={f} className={"export-tab" + (format === f ? " export-tab--active" : "")} onClick={() => setFormat(f)}>
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      {format === "png" && (
        <div className="export-fields">
          <label>Scale
            <select value={scale} onChange={(e) => setScale(Number(e.target.value) as Scale)}>
              <option value={1}>1x</option>
              <option value={2}>2x</option>
              <option value={4}>4x</option>
            </select>
          </label>
          <label className="export-checkbox">
            <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
            Transparent background
          </label>
        </div>
      )}

      {format === "svg" && (
        <div className="export-fields">
          <p className="export-note">Generates real vector paths where the generator supports it (Organic String Field). Others fall back with a message.</p>
        </div>
      )}

      {format === "webm" && (
        <div className="export-fields">
          <label>Resolution
            <select value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)}>
              <option value="1080p">1080p</option>
              <option value="1440p">1440p</option>
              <option value="4k">4K</option>
            </select>
          </label>
          <label>FPS
            <select value={fps} onChange={(e) => setFps(Number(e.target.value) as 24 | 30 | 60)}>
              <option value={24}>24</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </label>
          <label>Duration (s)
            <input type="number" min={1} max={30} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </label>
          <p className="export-note">Exports a genuine .webm — MP4 encoding isn&apos;t wired in yet.</p>
        </div>
      )}

      <button className="export-run" disabled={busy} onClick={handleExport}>
        {busy ? (format === "webm" ? `Rendering ${Math.round(progress * 100)}%` : "Rendering…") : `Export ${format.toUpperCase()}`}
      </button>
      {message && <p className="export-note export-note--warn">{message}</p>}
    </div>
  );
}
