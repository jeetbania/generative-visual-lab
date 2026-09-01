import { EffectDefinition } from "../engine/types";
import { stringFieldEffect } from "./stringField";
import { magneticFieldEffect } from "./magneticField";
import { auroraFieldEffect } from "./auroraField";
import { particleGlobeEffect } from "./particleGlobe";
import { flowFieldEffect } from "./flowField";
import { vortexFieldEffect } from "./vortexField";
import { attractorFieldEffect } from "./attractorField";
import { radialBurstEffect } from "./radialBurst";
import { orbitalParticlesEffect } from "./orbitalParticles";
import { convergingLinesEffect } from "./convergingLines";
import { noiseLandscapeEffect } from "./noiseLandscape";
import { elasticGridEffect } from "./elasticGrid";
import { dataStreamEffect } from "./dataStream";
import { rippleFieldEffect } from "./rippleField";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EFFECTS: EffectDefinition<any, any>[] = [
  // the three flagships
  stringFieldEffect, magneticFieldEffect, auroraFieldEffect,
  // geography
  particleGlobeEffect,
  // ten experiments built by recombining Source/Field/Behavior/Appearance primitives
  flowFieldEffect, vortexFieldEffect, attractorFieldEffect, radialBurstEffect,
  orbitalParticlesEffect, convergingLinesEffect, noiseLandscapeEffect,
  elasticGridEffect, dataStreamEffect, rippleFieldEffect,
];

export function findEffect(id: string) {
  return EFFECTS.find((e) => e.id === id) ?? EFFECTS[0];
}

export const CATEGORIES = ["FIELDS", "PARTICLES", "GEOMETRY", "ATMOSPHERE", "MAPS", "TYPOGRAPHY", "EXPERIMENTAL"] as const;

/** Planned generators not yet implemented — shown in the library, greyed out,
 *  so the intended breadth of the instrument is visible while it grows. */
export const PLANNED_EFFECTS: { name: string; category: (typeof CATEGORIES)[number] }[] = [
  { name: "Particle Wave", category: "PARTICLES" },
  { name: "Fluid Ribbon Field", category: "GEOMETRY" },
  { name: "Topographic Flow", category: "GEOMETRY" },
  { name: "Atmospheric Mesh", category: "ATMOSPHERE" },
  { name: "Particle Typography", category: "TYPOGRAPHY" },
  { name: "Distorted Grid", category: "GEOMETRY" },
  { name: "Signal Field", category: "EXPERIMENTAL" },
  { name: "Gravitational Field", category: "FIELDS" },
];
