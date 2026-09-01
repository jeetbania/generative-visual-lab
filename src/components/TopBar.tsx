"use client";

import { useRef, useState } from "react";
import { useStudio } from "@/lib/store/StudioProvider";
import { BUILTIN_PRESETS, Preset } from "@/lib/presets";
import { downloadBlob } from "@/lib/engine/export";
import { serializeProject, deserializeProject, Quality } from "@/lib/store/project";

const USER_PRESETS_KEY = "gvl-user-presets";

function loadUserPresets(): Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USER_PRESETS_KEY);
    return raw ? (JSON.parse(raw) as Preset[]) : [];
  } catch {
    return [];
  }
}

function saveUserPresets(presets: Preset[]) {
  window.localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
}

export default function TopBar({ presentation, onTogglePresentation }: { presentation: boolean; onTogglePresentation: () => void }) {
  const { state, dispatch } = useStudio();
  // Lazy initializer, not an effect: this component only ever renders
  // client-side (see app/page.tsx's dynamic ssr:false import), so reading
  // localStorage on first render is safe and avoids an extra render pass.
  const [userPresets, setUserPresets] = useState<Preset[]>(() => loadUserPresets());
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyPreset(id: string) {
    const preset = [...BUILTIN_PRESETS, ...userPresets].find((p) => p.id === id);
    if (preset) dispatch({ type: "LOAD_PRESET", preset });
  }

  function savePreset() {
    const name = window.prompt("Preset name?");
    if (!name) return;
    const preset: Preset = {
      id: `user-${Date.now()}`, name, effectId: state.effectId,
      baseColor: state.baseColor, modeId: state.modeId, seed: state.seed,
      params: state.paramsByEffect[state.effectId],
    };
    const next = [...userPresets, preset];
    setUserPresets(next);
    saveUserPresets(next);
  }

  function deletePreset(id: string) {
    const next = userPresets.filter((p) => p.id !== id);
    setUserPresets(next);
    saveUserPresets(next);
  }

  function exportProjectJSON() {
    const blob = new Blob([serializeProject(state)], { type: "application/json" });
    downloadBlob(blob, `generative-visual-lab-project.json`);
  }

  function importProjectJSON(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const project = deserializeProject(String(reader.result));
      if (project) dispatch({ type: "LOAD_PROJECT", project });
    };
    reader.readAsText(file);
  }

  if (presentation) return null;

  return (
    <div className="topbar">
      <div className="topbar-brand">Generative Visual Lab</div>

      <div className="topbar-group">
        <select className="topbar-select" defaultValue="" onChange={(e) => e.target.value && applyPreset(e.target.value)}>
          <option value="" disabled>Presets…</option>
          <optgroup label="Built-in">
            {BUILTIN_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
          {userPresets.length > 0 && (
            <optgroup label="Yours">
              {userPresets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          )}
        </select>
        <button onClick={savePreset} title="Save current settings as a preset">Save</button>
        {userPresets.length > 0 && (
          <button onClick={() => { const id = window.prompt(`Delete which preset id?\n${userPresets.map((p) => p.id).join("\n")}`); if (id) deletePreset(id); }} title="Delete a saved preset">Delete</button>
        )}
      </div>

      <div className="topbar-group">
        <button className="surprise-btn" onClick={() => dispatch({ type: "SURPRISE_ME" })} title="Intelligently mutate geometry, field, palette, composition and motion together">
          ✦ Surprise Me
        </button>
      </div>

      <div className="topbar-group">
        <button onClick={() => dispatch({ type: "TOGGLE_PLAY" })}>{state.playing ? "Pause" : "Play"}</button>
        <select className="topbar-select" value={state.quality} onChange={(e) => dispatch({ type: "SET_QUALITY", value: e.target.value as Quality })}>
          <option value="draft">Draft</option>
          <option value="balanced">Balanced</option>
          <option value="high">High</option>
          <option value="ultra">Ultra</option>
        </select>
      </div>

      <div className="topbar-group">
        <button onClick={exportProjectJSON} title="Export project JSON">Export JSON</button>
        <button onClick={() => fileInputRef.current?.click()} title="Import project JSON">Import JSON</button>
        <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importProjectJSON(e.target.files[0])} />
        <button onClick={onTogglePresentation} title="Fullscreen presentation (F)">Presentation</button>
      </div>
    </div>
  );
}
