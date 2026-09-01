"use client";

import { useEffect } from "react";
import { DialRoot, useDialKitController } from "dialkit";
import type { DialConfig } from "dialkit";
import "dialkit/styles.css";
import { useStudio } from "@/lib/store/StudioProvider";
import { findEffect } from "@/lib/effects/registry";
import { fieldsToDialConfig, dialValuesToParams } from "@/lib/dialkitConfig";
import { TIME_MODES } from "@/lib/engine/color";
import { ASPECT_SIZES, AspectPreset } from "@/lib/store/project";
import ExportPanel from "./ExportPanel";
import GeoPanel from "./GeoPanel";

/** Renders no UI itself — keyed by `${effectId}::${seed}` so a Randomize /
 *  Mutate / preset load (which always mints a new seed) forces DialKit to
 *  re-register with the freshly regenerated params as defaults. */
function EffectPanel() {
  const { state, dispatch } = useStudio();
  const effect = findEffect(state.effectId);
  const params = state.paramsByEffect[state.effectId];
  const config: DialConfig = fieldsToDialConfig(effect.fields, params);

  const dial = useDialKitController(effect.name, config, {
    id: `effect-${state.effectId}-${state.seed}`,
  });

  useEffect(() => {
    dispatch({ type: "SET_PARAMS", params: dialValuesToParams(dial.values as Record<string, unknown>) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dial.values]);

  return null;
}

function CompositionPanel() {
  const { state, dispatch } = useStudio();

  const config: DialConfig = {
    Color: {
      baseColor: { type: "color", default: state.baseColor },
      timeMode: { type: "select", options: TIME_MODES.map((m) => ({ value: m.id, label: m.name })), default: state.modeId },
      autoCycle: state.autoCycle,
      autoCycleSpeed: [state.autoCycleSpeed, 0.05, 4, 0.05],
      haze: [state.haze, 0, 1, 0.01],
      contrast: [state.contrast, 0, 1, 0.01],
      glowIntensity: [state.glowIntensity, 0, 1, 0.01],
      grain: [state.grain, 0, 1, 0.01],
    },
    Composition: {
      aspect: { type: "select", options: Object.keys(ASPECT_SIZES), default: state.composition.aspect },
      width: [state.composition.width, 200, 3840, 10],
      height: [state.composition.height, 200, 3840, 10],
    },
    Depth: {
      depth: { type: "select", options: ["off", "subtle", "strong"], default: state.depth },
    },
    Motion: {
      speed: [state.speed, 0, 3, 0.01],
      playing: state.playing,
    },
    Interaction: {
      interactionEnabled: state.interactionEnabled,
    },
  };

  const dial = useDialKitController("Studio", config, { id: `studio-global-${state.revision}` });

  useEffect(() => {
    const v = dial.values as unknown as {
      Color: { baseColor: string; timeMode: string; autoCycle: boolean; autoCycleSpeed: number; haze: number; contrast: number; glowIntensity: number; grain: number };
      Composition: { aspect: AspectPreset; width: number; height: number };
      Depth: { depth: "off" | "subtle" | "strong" };
      Motion: { speed: number; playing: boolean };
      Interaction: { interactionEnabled: boolean };
    };
    dispatch({
      type: "SET_MISC", patch: {
        baseColor: v.Color.baseColor, modeId: v.Color.timeMode, autoCycle: v.Color.autoCycle,
        autoCycleSpeed: v.Color.autoCycleSpeed, haze: v.Color.haze, contrast: v.Color.contrast,
        glowIntensity: v.Color.glowIntensity, grain: v.Color.grain,
        depth: v.Depth.depth, speed: v.Motion.speed, playing: v.Motion.playing,
        interactionEnabled: v.Interaction.interactionEnabled,
      },
    });
    const preset = ASPECT_SIZES[v.Composition.aspect];
    if (preset) {
      if (preset[0] !== state.composition.width || preset[1] !== state.composition.height || v.Composition.aspect !== state.composition.aspect) {
        dispatch({ type: "SET_COMPOSITION", width: preset[0], height: preset[1], aspect: v.Composition.aspect });
      }
    } else if (v.Composition.width !== state.composition.width || v.Composition.height !== state.composition.height || v.Composition.aspect !== state.composition.aspect) {
      dispatch({ type: "SET_COMPOSITION", width: v.Composition.width, height: v.Composition.height, aspect: v.Composition.aspect });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dial.values]);

  return null;
}

export default function Inspector() {
  const { state, dispatch, undo, redo, canUndo, canRedo } = useStudio();

  return (
    <div className="inspector">
      <div className="inspector-header">
        <span className="inspector-title">Inspector</span>
        <div className="inspector-history">
          <button disabled={!canUndo} onClick={undo} title="Undo">↶</button>
          <button disabled={!canRedo} onClick={redo} title="Redo">↷</button>
        </div>
      </div>

      <div className="inspector-seed">
        <div className="seed-value">
          <span className="seed-label">Seed</span>
          <span className="seed-number">{state.seed}</span>
        </div>
        <div className="seed-actions">
          <button onClick={() => dispatch({ type: "RANDOMIZE_SEED" })}>Randomize</button>
          <button onClick={() => dispatch({ type: "MUTATE", amount: 0.08 })}>Mutate</button>
          <button onClick={() => dispatch({ type: "RESET_EFFECT" })}>Reset</button>
        </div>
      </div>

      <EffectPanel key={`${state.effectId}::${state.seed}`} />
      <CompositionPanel key={state.revision} />

      <div className="inspector-scroll">
        <DialRoot mode="inline" theme="dark" productionEnabled />
        {state.effectId === "particle-globe" && <GeoPanel />}
      </div>

      <ExportPanel />
    </div>
  );
}
