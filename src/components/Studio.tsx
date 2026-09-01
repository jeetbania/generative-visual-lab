"use client";

import { useCallback, useEffect, useState } from "react";
import { StudioProvider, useStudio } from "@/lib/store/StudioProvider";
import { Quality } from "@/lib/store/project";
import TopBar from "./TopBar";
import EffectLibrary from "./EffectLibrary";
import Canvas from "./Canvas";
import Inspector from "./Inspector";
import { getExportSnapshot } from "@/lib/store/exportBridge";
import { exportPNG } from "@/lib/engine/export";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function KeyboardShortcuts({ presentation, onTogglePresentation }: { presentation: boolean; onTogglePresentation: () => void }) {
  const { state, dispatch } = useStudio();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      switch (e.key.toLowerCase()) {
        case " ":
          e.preventDefault();
          dispatch({ type: "TOGGLE_PLAY" });
          break;
        case "r":
          dispatch({ type: "RANDOMIZE_SEED" });
          break;
        case "m":
          dispatch({ type: "MUTATE", amount: 0.08 });
          break;
        case "x":
          dispatch({ type: "SURPRISE_ME" });
          break;
        case "f":
          onTogglePresentation();
          break;
        case "e": {
          const snap = getExportSnapshot();
          if (snap) {
            exportPNG({
              effect: snap.effect, params: snap.params, palette: snap.palette, seed: snap.seed,
              width: state.composition.width * 2, height: state.composition.height * 2,
              time: snap.time, depth: snap.depth, quality: "ultra",
              comp: { haze: state.haze, contrast: state.contrast, glowIntensity: state.glowIntensity, grain: state.grain, transparentBackground: state.transparentBackground },
            }, `${snap.effect.id}-${snap.seed}.png`);
          }
          break;
        }
        case "1": dispatch({ type: "SET_QUALITY", value: "draft" as Quality }); break;
        case "2": dispatch({ type: "SET_QUALITY", value: "balanced" as Quality }); break;
        case "3": dispatch({ type: "SET_QUALITY", value: "high" as Quality }); break;
        case "4": dispatch({ type: "SET_QUALITY", value: "ultra" as Quality }); break;
        case "escape":
          if (presentation) onTogglePresentation();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, presentation, onTogglePresentation, state]);

  return null;
}

function StudioShell() {
  const [presentation, setPresentation] = useState(false);
  const togglePresentation = useCallback(() => setPresentation((p) => !p), []);

  return (
    <div className={presentation ? "studio studio--presentation" : "studio"}>
      <KeyboardShortcuts presentation={presentation} onTogglePresentation={togglePresentation} />
      <TopBar presentation={presentation} onTogglePresentation={togglePresentation} />
      <div className="studio-body">
        {!presentation && <EffectLibrary />}
        <Canvas presentation={presentation} />
        {!presentation && <Inspector />}
      </div>
      {presentation && (
        <button className="presentation-exit" onClick={togglePresentation} title="Exit presentation (Esc)">
          Exit
        </button>
      )}
    </div>
  );
}

export default function Studio() {
  return (
    <StudioProvider>
      <StudioShell />
    </StudioProvider>
  );
}
