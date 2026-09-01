/**
 * "Surprise Me" — NOT a full reroll. It nudges geometry + field + particles
 * + palette + composition + motion together, by degrees, so the result is
 * recognizably related to what's on screen rather than a totally different
 * piece. Keep pressing it and you get a walk through nearby compositions;
 * hit Save the moment one lands (seed + full params, exactly reproducible).
 */

import { EFFECTS, findEffect } from "../effects/registry";
import { SeededRandom, mutateNumericParams, randomSeed } from "./random";
import { numericRanges } from "./types";
import { ProjectState, ASPECT_SIZES, AspectPreset } from "../store/project";
import { TIME_MODES, hexToOklch, oklchToHex, findMode } from "./color";

function nudgeColor(hex: string, rng: SeededRandom, amount: number): string {
  const o = hexToOklch(hex);
  return oklchToHex({
    l: Math.min(0.99, Math.max(0.02, o.l + rng.gaussian() * 0.06 * amount)),
    c: Math.max(0, o.c + rng.gaussian() * 0.015 * amount),
    h: o.h + rng.gaussian() * 10 * amount,
  });
}

export function surpriseMe(state: ProjectState, amount = 0.22): ProjectState {
  const rng = new SeededRandom(randomSeed());
  let effectId = state.effectId;
  let params = { ...state.paramsByEffect[effectId] };

  const switchEffect = rng.chance(0.28);
  if (switchEffect) {
    const current = findEffect(effectId);
    const sameCategory = EFFECTS.filter((e) => e.category === current.category && e.id !== effectId);
    const pool = rng.chance(0.65) && sameCategory.length > 0 ? sameCategory : EFFECTS.filter((e) => e.id !== effectId);
    const next = rng.pick(pool.length > 0 ? pool : EFFECTS);
    effectId = next.id;
    const base = { ...next.defaultParams };
    const ranges = numericRanges(next.fields);
    params = mutateNumericParams(base, ranges, 0.35, rng);
  } else {
    const effect = findEffect(effectId);
    const ranges = numericRanges(effect.fields);
    params = mutateNumericParams(params, ranges, amount, rng);
  }

  let baseColor = state.baseColor;
  let modeId = state.modeId;
  const colorRoll = rng.next();
  if (colorRoll < 0.15) {
    // rare bigger jump — a genuinely new environment, still tastefully bounded
    const { baseHex, mode } = ((): { baseHex: string; mode: { id: string } } => {
      const l = rng.chance(0.5) ? rng.range(0.9, 0.98) : rng.range(0.04, 0.16);
      const hex = oklchToHex({ l, c: rng.range(0, 0.02), h: rng.range(0, 360) });
      return { baseHex: hex, mode: rng.pick(TIME_MODES) };
    })();
    baseColor = baseHex;
    modeId = mode.id;
  } else if (colorRoll < 0.45) {
    const idx = TIME_MODES.findIndex((m) => m.id === modeId);
    const dir = rng.chance(0.5) ? 1 : -1;
    const nextIdx = ((idx < 0 ? 0 : idx) + dir + TIME_MODES.length) % TIME_MODES.length;
    modeId = TIME_MODES[nextIdx].id;
  } else {
    baseColor = nudgeColor(baseColor, rng, amount * 1.4);
  }
  // keep the mode sane if we jumped to a color that no longer suits it
  if (colorRoll >= 0.15 && rng.chance(0.2)) modeId = findMode(modeId).id;

  let composition = state.composition;
  if (rng.chance(0.12)) {
    const presets = Object.keys(ASPECT_SIZES).filter((k) => k !== "custom") as AspectPreset[];
    const aspect = rng.pick(presets);
    const size = ASPECT_SIZES[aspect]!;
    composition = { width: size[0], height: size[1], aspect };
  }

  const speed = Math.min(3, Math.max(0.15, state.speed * rng.range(0.85, 1.2)));
  const depthOptions: ProjectState["depth"][] = ["off", "subtle", "strong"];
  const depth = rng.chance(0.15) ? rng.pick(depthOptions) : state.depth;

  return {
    ...state,
    revision: state.revision + 1,
    effectId,
    paramsByEffect: { ...state.paramsByEffect, [effectId]: params },
    seed: randomSeed(),
    baseColor, modeId, composition, speed, depth,
  };
}
